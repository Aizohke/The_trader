import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const WsContext = createContext(null);

export function WsProvider({ children }) {
  const [candles,      setCandles]      = useState([]);
  const [liveBar,      setLiveBar]      = useState(null);   // in-progress bar from live tick
  const [signals,      setSignals]      = useState([]);
  const [latestSignal, setLatestSignal] = useState(null);
  const [connected,    setConnected]    = useState(false);
  const [ticker,       setTicker]       = useState({ price: '', change: 0, dir: 'up' });

  const wsRef      = useRef(null);
  const prevClose  = useRef(null);
  const retryRef   = useRef(null);

  const connect = useCallback(() => {
    const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('[WS] Connected');
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    };

    ws.onmessage = (evt) => {
      const { type, payload } = JSON.parse(evt.data);

      // ── Full history on connect ───────────────────────────
      if (type === 'INIT_CANDLES') {
        const sorted = [...payload].sort((a, b) => a.time - b.time);
        setCandles(sorted);
        const last = sorted[sorted.length - 1];
        if (last) {
          prevClose.current = last.close;
          setTicker({ price: last.close.toFixed(5), change: 0, dir: 'up' });
        }
      }

      // ── Recent signals on connect ─────────────────────────
      if (type === 'INIT_SIGNALS') {
        setSignals(payload);
      }

      // ── Closed 5-min candle — add to chart ───────────────
      if (type === 'CANDLE') {
        const c = payload;
        setCandles((prev) => {
          // deduplicate by time
          const exists = prev.some((x) => x.time === c.time);
          if (exists) return prev.map((x) => x.time === c.time ? c : x);
          const updated = [...prev, c].sort((a, b) => a.time - b.time);
          return updated.length > 150 ? updated.slice(-150) : updated;
        });
        setLiveBar(null); // clear live bar — it's now a closed bar
        const chg = parseFloat((c.close - (prevClose.current || c.open)).toFixed(5));
        setTicker({ price: c.close.toFixed(5), change: chg, dir: chg >= 0 ? 'up' : 'dn' });
        prevClose.current = c.close;
      }

      // ── Live tick — update forming bar in real time ───────
      if (type === 'LIVE_TICK') {
        const c = payload;
        setLiveBar(c);
        const chg = parseFloat((c.close - (prevClose.current || c.open)).toFixed(5));
        setTicker({ price: c.close.toFixed(5), change: chg, dir: chg >= 0 ? 'up' : 'dn' });
      }

      // ── New ICT signal ────────────────────────────────────
      if (type === 'SIGNAL') {
        setSignals((prev) => [payload, ...prev.slice(0, 49)]);
        setLatestSignal(payload);
        setTimeout(() => setLatestSignal(null), 5000);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.warn('[WS] Closed — retrying in 3s');
      retryRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = (e) => {
      console.error('[WS] Error:', e);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <WsContext.Provider value={{ candles, liveBar, signals, latestSignal, connected, ticker }}>
      {children}
    </WsContext.Provider>
  );
}

export const useWs = () => useContext(WsContext);
