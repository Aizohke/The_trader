/**
 * pricefeed.js
 *
 * Connects to Twelve Data's free WebSocket price stream for EUR/USD.
 * Aggregates raw price ticks into 5-minute OHLCV candles, then emits:
 *   - 'candle'  { time, open, high, low, close, volume }  on every tick (live candle update)
 *   - 'closed'  { ...candle }                              when a 5-min bar closes
 *   - 'history' [ ...candles ]                             on startup (REST historical bars)
 *   - 'error'   { message }
 *
 * Free tier limits (Twelve Data):
 *   - 800 API calls / day
 *   - 1 WebSocket connection
 *   - Real-time forex tick data included
 *
 * Sign up for a free key at: https://twelvedata.com
 */

const WebSocket  = require('ws');
const https      = require('https');
const { EventEmitter } = require('events');

const SYMBOL       = 'EUR/USD';
const INTERVAL_MS  = 5 * 60 * 1000;   // 5-minute candles
const HISTORY_BARS = 120;              // how many historical bars to pre-load via REST
const TD_WS_URL    = 'wss://ws.twelvedata.com/v1/quotes/price';

class PriceFeed extends EventEmitter {
  constructor(apiKey) {
    super();
    if (!apiKey) throw new Error('TWELVE_DATA_API_KEY is required');
    this.apiKey      = apiKey;
    this.ws          = null;
    this.currentBar  = null;   // the live forming candle
    this.barStart    = null;   // unix ms when current bar started
    this.retryTimer  = null;
    this.connected   = false;
    this._closedDedup = new Set(); // prevent duplicate closed-bar emits
  }

  // ── Public API ─────────────────────────────────────────────
  async start() {
    await this._loadHistory();
    this._connect();
  }

  stop() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.ws) { this.ws.terminate(); this.ws = null; }
  }

  getLiveBar() { return this.currentBar ? { ...this.currentBar } : null; }

  // ── REST: load historical 5-minute bars ───────────────────
  _loadHistory() {
    return new Promise((resolve) => {
      const url = `https://api.twelvedata.com/time_series`
        + `?symbol=${encodeURIComponent(SYMBOL)}`
        + `&interval=5min`
        + `&outputsize=${HISTORY_BARS}`
        + `&format=JSON`
        + `&apikey=${this.apiKey}`;

      https.get(url, (res) => {
        let raw = '';
        res.on('data', (d) => (raw += d));
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            if (json.status === 'error') {
              console.error(`[PriceFeed] Twelve Data REST error: ${json.message}`);
              resolve([]);
              return;
            }
            // Twelve Data returns newest-first; reverse to chronological
            const bars = (json.values || []).reverse().map((v) => ({
              time:   Math.floor(new Date(v.datetime).getTime() / 1000),
              open:   parseFloat(v.open),
              high:   parseFloat(v.high),
              low:    parseFloat(v.low),
              close:  parseFloat(v.close),
              volume: parseInt(v.volume || 0, 10),
            }));
            console.log(`[PriceFeed] Loaded ${bars.length} historical bars`);
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

  // ── WebSocket: live tick stream ───────────────────────────
  _connect() {
    if (this.ws) { try { this.ws.terminate(); } catch (_) {} }

    const url = `${TD_WS_URL}?apikey=${this.apiKey}`;
    const ws  = new WebSocket(url);
    this.ws   = ws;

    ws.on('open', () => {
      console.log('[PriceFeed] WebSocket connected to Twelve Data');
      this.connected = true;
      // Subscribe to EUR/USD tick stream
      ws.send(JSON.stringify({
        action: 'subscribe',
        params: { symbols: SYMBOL },
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this._handleMessage(msg);
      } catch (e) {
        console.error('[PriceFeed] Message parse error:', e.message);
      }
    });

    ws.on('close', (code, reason) => {
      this.connected = false;
      console.warn(`[PriceFeed] WS closed (${code}). Reconnecting in 5s…`);
      this.retryTimer = setTimeout(() => this._connect(), 5000);
    });

    ws.on('error', (e) => {
      console.error('[PriceFeed] WS error:', e.message);
      // close handler will fire and retry
    });

    // Keep-alive ping every 10s (Twelve Data requires this)
    this._pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'heartbeat' }));
      }
    }, 10000);

    ws.on('close', () => clearInterval(this._pingInterval));
  }

  // ── Process incoming tick ─────────────────────────────────
  _handleMessage(msg) {
    // Twelve Data sends: { event, symbol, price, timestamp, ... }
    if (msg.event === 'subscribe-status') {
      console.log('[PriceFeed] Subscribed:', msg.status, msg.symbol?.join?.(','));
      return;
    }
    if (msg.event === 'heartbeat') return;
    if (msg.event === 'error') {
      console.error('[PriceFeed] Server error:', msg.message);
      this.emit('error', { message: msg.message });
      return;
    }

    // Price tick
    const price = parseFloat(msg.price);
    const ts    = msg.timestamp ? parseInt(msg.timestamp, 10) * 1000 : Date.now();
    if (!price || isNaN(price)) return;

    const barStartMs = Math.floor(ts / INTERVAL_MS) * INTERVAL_MS;

    // New bar starting
    if (!this.currentBar || barStartMs > this.barStart) {
      // Close out the previous bar
      if (this.currentBar && !this._closedDedup.has(this.barStart)) {
        this._closedDedup.add(this.barStart);
        // Trim dedup set to avoid memory leak
        if (this._closedDedup.size > 200) {
          const first = this._closedDedup.values().next().value;
          this._closedDedup.delete(first);
        }
        this.emit('closed', { ...this.currentBar });
      }
      // Open new bar
      this.barStart   = barStartMs;
      this.currentBar = {
        time:   Math.floor(barStartMs / 1000),
        open:   price,
        high:   price,
        low:    price,
        close:  price,
        volume: 1,
      };
    } else {
      // Update current bar
      this.currentBar.high   = Math.max(this.currentBar.high, price);
      this.currentBar.low    = Math.min(this.currentBar.low,  price);
      this.currentBar.close  = price;
      this.currentBar.volume += 1;
    }

    // Emit live (in-progress) bar update on every tick
    this.emit('candle', { ...this.currentBar });
  }
}

module.exports = PriceFeed;
