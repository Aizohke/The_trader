import React, { useEffect, useState } from 'react';
import { useWs } from '../context/WsContext';
import './Toast.css';

export default function Toast() {
  const { latestSignal } = useWs();
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    if (!latestSignal) { setVisible(false); return; }
    setCurrent(latestSignal);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [latestSignal]);

  if (!visible || !current) return null;

  const bull = current.direction === 'BUY';

  return (
    <div className={`toast ${bull ? 'toast-bull' : 'toast-bear'}`} onClick={() => setVisible(false)}>
      <div className="toast-icon">{bull ? '🟢' : '🔴'}</div>
      <div className="toast-body">
        <div className="toast-title">
          <strong>{current.direction}</strong> Signal · EUR/USD
        </div>
        <div className="toast-details mono">
          Entry {current.entry} · SL {current.sl} · TP {current.tp}
        </div>
        <div className="toast-rr">
          R:R 1:{current.rr} · Session {(current.session || '').toUpperCase()}
        </div>
      </div>
      <button className="toast-close" onClick={() => setVisible(false)}>✕</button>
    </div>
  );
}
