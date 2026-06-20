import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const WsContext = createContext(null);

export function WsProvider({ children }) {
  const [candles,       setCandles]       = useState([]);
  const [signals,       setSignals]       = useState([]);
  const [latestSignal,  setLatestSignal]  = useState(null);
  const [connected,     setConnected]     = useState(false);
  const [ticker,        setTicker]        = useState({ price: '', change: 0, dir: 'up' });
  const wsRef     = useRef(null);
  const prevClose = useRef(null);
  const retryRef  = useRef(null);

  const connect = useCallback(() => {
    const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('WS connected');
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    };

    ws.onmessage = (evt) => {
      const { type, payload } = JSON.parse(evt.data);

      if (type === 'INIT_CANDLES') {
        setCandles(payload);
        const last = payload[payload.length - 1];
        if (last) {
          prevClose.current = last.close;
          setTicker({ price: last.close.toFixed(5), change: 0, dir: 'up' });
        }
      }

      if (type === 'INIT_SIGNALS') {
        setSignals(payload);
      }

      if (type === 'CANDLE') {
        const c = payload;
        setCandles((prev) => {
          const updated = [...prev, c];
          return updated.length > 150 ? updated.slice(-150) : updated;
        });
        // Update ticker
        const prev = prevClose.current || c.open;
        const chg  = parseFloat((c.close - prev).toFixed(5));
        setTicker({ price: c.close.toFixed(5), change: chg, dir: chg >= 0 ? 'up' : 'dn' });
        prevClose.current = c.close;
      }

      if (type === 'SIGNAL') {
        setSignals((prev) => [payload, ...prev.slice(0, 49)]);
        setLatestSignal(payload);
        setTimeout(() => setLatestSignal(null), 5000);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('WS closed — retrying in 3 s');
      retryRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = (e) => {
      console.error('WS error', e);
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
    <WsContext.Provider value={{ candles, signals, latestSignal, connected, ticker }}>
      {children}
    </WsContext.Provider>
  );
}

export const useWs = () => useContext(WsContext);
