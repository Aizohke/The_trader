import React, { useEffect, useState } from 'react';
import { useWs } from '../context/WsContext';
import './Toast.css';

export default function Toast() {
  const { latestSignal } = useWs();
  const [visible,  setVisible]  = useState(false);
  const [current,  setCurrent]  = useState(null);

  useEffect(() => {
    if (!latestSignal) { setVisible(false); return; }
    setCurrent(latestSignal);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, [latestSignal]);

  if (!visible || !current) return null;
  const bull = current.direction === 'BUY';

  return (
    <div
      className={`toast ${bull ? 'toast-bull' : 'toast-bear'}`}
      onClick={() => setVisible(false)}
      role="alert"
    >
      <div className="toast-icon">{bull ? '🟢' : '🔴'}</div>
      <div className="toast-body">
        <div className="toast-title">
          <strong>{current.direction}</strong> Signal · EUR/USD
          {current.hasConfirmation && <span className="toast-conf">✓ Confirmed</span>}
        </div>
        <div className="toast-row mono">
          Entry <strong>{current.entry}</strong> · SL {current.sl} · TP {current.tp}
        </div>
        <div className="toast-row">
          R:R 1:{current.rr} · {(current.killzone || current.session || '').toUpperCase()}
          {current.htfBias && <span className={`toast-bias ${current.htfBias}`}>{current.htfBias.toUpperCase()} BIAS</span>}
        </div>
      </div>
      <button className="toast-close" onClick={() => setVisible(false)} aria-label="Close">✕</button>
    </div>
  );
}
