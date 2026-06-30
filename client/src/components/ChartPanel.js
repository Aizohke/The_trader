import React, { useState, useMemo } from 'react';
import { useWs } from '../context/WsContext';
import TradingChart from './TradingChart';
import './ChartPanel.css';

export default function ChartPanel() {
  const { candles, liveBar, signals } = useWs();
  const [tf, setTf] = useState('5M');

  const stats = useMemo(() => {
    const last  = liveBar || candles[candles.length - 1];
    const first = candles[0];
    if (!last || !first) return {};
    const allHighs = [...candles.map((c) => c.high), liveBar?.high || 0];
    const allLows  = [...candles.map((c) => c.low),  liveBar?.low  || Infinity];
    const chg      = last.close - first.open;
    const chgPct   = ((chg / first.open) * 100).toFixed(3);
    return {
      open:   first.open.toFixed(5),
      high:   Math.max(...allHighs).toFixed(5),
      low:    Math.min(...allLows).toFixed(5),
      chgPct,
      vol:    candles.reduce((s, c) => s + (c.volume || 0), 0).toLocaleString(),
    };
  }, [candles, liveBar]);

  return (
    <div className="chart-panel">
      <div className="stat-bar">
        {[
          { label: 'Open',   val: stats.open,   color: 'var(--text-primary)' },
          { label: 'High',   val: stats.high,   color: 'var(--green)' },
          { label: 'Low',    val: stats.low,    color: 'var(--red)' },
          { label: 'Change', val: stats.chgPct ? (parseFloat(stats.chgPct) > 0 ? '+' : '') + stats.chgPct + '%' : '—', color: parseFloat(stats.chgPct) >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Vol',    val: stats.vol,    color: 'var(--text-secondary)' },
          { label: 'Signals',val: signals.length, color: 'var(--blue)' },
        ].map(({ label, val, color }) => (
          <div className="stat-item" key={label}>
            <span className="stat-label">{label}</span>
            <span className="stat-val mono" style={{ color }}>{val || '—'}</span>
          </div>
        ))}
      </div>

      <div className="chart-toolbar">
        <div className="chart-title">
          <span className="chart-pair">EUR/USD</span>
          <span className="chart-desc">
            ICT v2 · 6 Filters Active · Twelve Data
            {liveBar && <span className="live-dot"> ● LIVE</span>}
          </span>
        </div>
        <div className="tf-group">
          {['1M','5M','15M','1H','4H'].map((t) => (
            <button key={t} className={`tf-btn ${tf === t ? 'active' : ''}`} onClick={() => setTf(t)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="chart-area">
        <TradingChart signals={signals} />
      </div>
    </div>
  );
}
