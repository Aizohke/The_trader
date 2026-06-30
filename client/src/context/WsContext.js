import React, {
  createContext, useContext, useEffect,
  useRef, useState, useCallback,
} from 'react';
import { useNotifications } from '../hooks/useNotifications';

const WsContext = createContext(null);

export function WsProvider({ children }) {
  const [candles,      setCandles]      = useState([]);
  const [liveBar,      setLiveBar]      = useState(null);
  const [signals,      setSignals]      = useState([]);
  const [latestSignal, setLatestSignal] = useState(null);
  const [connected,    setConnected]    = useState(false);
  const [ticker,       setTicker]       = useState({ price: '', change: 0, dir: 'up' });

  const wsRef     = useRef(null);
  const prevClose = useRef(null);
  const retryRef  = useRef(null);

  const { notify } = useNotifications();

  const connect = useCallback(() => {
    const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';
    const ws     = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    };

    ws.onmessage = (evt) => {
      const { type, payload } = JSON.parse(evt.data);

      switch (type) {
        case 'INIT_CANDLES': {
          const sorted = [...payload].sort((a, b) => a.time - b.time);
          setCandles(sorted);
          const last = sorted[sorted.length - 1];
          if (last) {
            prevClose.current = last.close;
            setTicker({ price: last.close.toFixed(5), change: 0, dir: 'up' });
          }
          break;
        }

        case 'INIT_SIGNALS':
          setSignals(payload);
          break;

        case 'CANDLE': {
          const c = payload;
          setCandles((prev) => {
            const exists = prev.some((x) => x.time === c.time);
            if (exists) return prev.map((x) => (x.time === c.time ? c : x));
            const updated = [...prev, c].sort((a, b) => a.time - b.time);
            return updated.length > 150 ? updated.slice(-150) : updated;
          });
          setLiveBar(null);
          const chg = parseFloat((c.close - (prevClose.current || c.open)).toFixed(5));
          setTicker({ price: c.close.toFixed(5), change: chg, dir: chg >= 0 ? 'up' : 'dn' });
          prevClose.current = c.close;
          break;
        }

        case 'LIVE_TICK': {
          const c   = payload;
          setLiveBar(c);
          const chg = parseFloat((c.close - (prevClose.current || c.open)).toFixed(5));
          setTicker({ price: c.close.toFixed(5), change: chg, dir: chg >= 0 ? 'up' : 'dn' });
          break;
        }

        case 'SIGNAL':
          setSignals((prev) => [payload, ...prev.slice(0, 49)]);
          setLatestSignal(payload);
          notify(payload);                          // ← browser push notification
          setTimeout(() => setLatestSignal(null), 6000);
          break;

        case 'SIGNAL_UPDATED':
          setSignals((prev) =>
            prev.map((s) => (s._id === payload._id ? payload : s))
          );
          break;

        case 'SIGNAL_DELETED':
          setSignals((prev) => prev.filter((s) => s._id !== payload._id));
          break;

        case 'SIGNALS_CLEARED':
          setSignals([]);
          break;

        default:
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      retryRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [notify]);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Expose deleteSignal and updateSignal so any component can call them
  const deleteSignal = useCallback(async (id) => {
    const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    const res  = await fetch(`${BASE}/api/signals/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    // WS broadcast will update local state automatically
  }, []);

  const updateSignal = useCallback(async (id, body) => {
    const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    const res  = await fetch(`${BASE}/api/signals/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Update failed');
  }, []);

  return (
    <WsContext.Provider value={{
      candles, liveBar, signals, latestSignal,
      connected, ticker, deleteSignal, updateSignal,
    }}>
      {children}
    </WsContext.Provider>
  );
}

export const useWs = () => useContext(WsContext);
