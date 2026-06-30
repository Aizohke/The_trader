/**
 * pricefeed.js
 * Connects to Twelve Data WebSocket for live EUR/USD ticks.
 * Aggregates ticks into 5-minute OHLCV candles and emits:
 *   'history'  [ ...candles ]   — on startup (REST historical bars)
 *   'candle'   { ...bar }       — live in-progress bar update (every tick)
 *   'closed'   { ...bar }       — each fully closed 5-min bar
 *   'error'    { message }
 *
 * Free tier: https://twelvedata.com (800 REST calls/day + 1 WS connection)
 */

const WebSocket        = require('ws');
const https            = require('https');
const { EventEmitter } = require('events');

const SYMBOL      = 'EUR/USD';
const INTERVAL_MS = 5 * 60 * 1000;   // 5-minute bars
const HISTORY_N   = 120;              // bars to pre-load via REST
const TD_WS_URL   = 'wss://ws.twelvedata.com/v1/quotes/price';

class PriceFeed extends EventEmitter {
  constructor(apiKey) {
    super();
    if (!apiKey) throw new Error('TWELVE_DATA_API_KEY is required');
    this.apiKey        = apiKey;
    this.ws            = null;
    this.currentBar    = null;
    this.barStart      = null;
    this.retryTimer    = null;
    this.pingInterval  = null;
    this.connected     = false;
    this._closedDedup  = new Set();
  }

  async start() {
    await this._loadHistory();
    this._connect();
  }

  stop() {
    if (this.retryTimer)   clearTimeout(this.retryTimer);
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws)           { try { this.ws.terminate(); } catch (_) {} }
  }

  getLiveBar() { return this.currentBar ? { ...this.currentBar } : null; }

  // ── REST: historical 5-minute bars ─────────────────────────
  _loadHistory() {
    return new Promise((resolve) => {
      const url =
        `https://api.twelvedata.com/time_series` +
        `?symbol=${encodeURIComponent(SYMBOL)}` +
        `&interval=5min` +
        `&outputsize=${HISTORY_N}` +
        `&format=JSON` +
        `&apikey=${this.apiKey}`;

      https.get(url, (res) => {
        let raw = '';
        res.on('data', (d) => (raw += d));
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            if (json.status === 'error') {
              console.error(`[PriceFeed] REST error: ${json.message}`);
              return resolve([]);
            }
            const bars = (json.values || []).reverse().map((v) => ({
              time:   Math.floor(new Date(v.datetime).getTime() / 1000),
              open:   parseFloat(v.open),
              high:   parseFloat(v.high),
              low:    parseFloat(v.low),
              close:  parseFloat(v.close),
              volume: parseInt(v.volume || 0, 10),
            }));
            console.log(`[PriceFeed] ${bars.length} historical bars loaded`);
            this.emit('history', bars);
            resolve(bars);
          } catch (e) {
            console.error('[PriceFeed] REST parse error:', e.message);
            resolve([]);
          }
        });
      }).on('error', (e) => {
        console.error('[PriceFeed] REST request error:', e.message);
        resolve([]);
      });
    });
  }

  // ── WebSocket: live tick stream ─────────────────────────────
  _connect() {
    if (this.ws) { try { this.ws.terminate(); } catch (_) {} }
    if (this.pingInterval) clearInterval(this.pingInterval);

    const ws = new WebSocket(`${TD_WS_URL}?apikey=${this.apiKey}`);
    this.ws  = ws;

    ws.on('open', () => {
      this.connected = true;
      console.log('[PriceFeed] WebSocket connected');
      ws.send(JSON.stringify({ action: 'subscribe', params: { symbols: SYMBOL } }));

      // Twelve Data requires a heartbeat every 10s
      this.pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'heartbeat' }));
        }
      }, 10000);
    });

    ws.on('message', (data) => {
      try { this._handleMessage(JSON.parse(data.toString())); } catch (_) {}
    });

    ws.on('close', (code) => {
      this.connected = false;
      clearInterval(this.pingInterval);
      console.warn(`[PriceFeed] WS closed (${code}) — reconnecting in 5s`);
      this.retryTimer = setTimeout(() => this._connect(), 5000);
    });

    ws.on('error', (e) => {
      console.error('[PriceFeed] WS error:', e.message);
      ws.close();
    });
  }

  // ── Tick handler ────────────────────────────────────────────
  _handleMessage(msg) {
    if (msg.event === 'heartbeat') return;
    if (msg.event === 'subscribe-status') {
      console.log('[PriceFeed] Subscribed:', msg.status);
      return;
    }
    if (msg.event === 'error') {
      this.emit('error', { message: msg.message });
      return;
    }

    const price = parseFloat(msg.price);
    const ts    = msg.timestamp ? parseInt(msg.timestamp, 10) * 1000 : Date.now();
    if (!price || isNaN(price)) return;

    const barStartMs = Math.floor(ts / INTERVAL_MS) * INTERVAL_MS;

    // New bar
    if (!this.currentBar || barStartMs > this.barStart) {
      if (this.currentBar && !this._closedDedup.has(this.barStart)) {
        this._closedDedup.add(this.barStart);
        if (this._closedDedup.size > 200) {
          this._closedDedup.delete(this._closedDedup.values().next().value);
        }
        this.emit('closed', { ...this.currentBar });
      }
      this.barStart   = barStartMs;
      this.currentBar = {
        time:   Math.floor(barStartMs / 1000),
        open:   price, high: price, low: price, close: price, volume: 1,
      };
    } else {
      this.currentBar.high   = Math.max(this.currentBar.high, price);
      this.currentBar.low    = Math.min(this.currentBar.low,  price);
      this.currentBar.close  = price;
      this.currentBar.volume += 1;
    }

    this.emit('candle', { ...this.currentBar });
  }
}

module.exports = PriceFeed;
