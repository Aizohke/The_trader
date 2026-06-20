import React, { useState, useMemo } from 'react';
import { useWs } from '../context/WsContext';
import TradingChart from './TradingChart';
import './ChartPanel.css';

const TIMEFRAMES = ['1M', '5M', '15M', '1H', '4H'];

export default function ChartPanel() {
  const { candles, signals } = useWs();
  const [tf, setTf] = useState('5M');

  const stats = useMemo(() => {
    if (!candles.length) return {};
    const last  = candles[candles.length - 1];
    const first = candles[0];
    const highs = candles.map((c) => c.high);
    const lows  = candles.map((c) => c.low);
    const chg   = last.close - first.open;
    const chgPct = ((chg / first.open) * 100).toFixed(3);
    return {
      open:    first.open.toFixed(5),
      high:    Math.max(...highs).toFixed(5),
      low:     Math.min(...lows).toFixed(5),
      close:   last.close.toFixed(5),
      chg:     chg.toFixed(5),
      chgPct,
      vol:     candles.reduce((s, c) => s + (c.volume || 0), 0).toLocaleString(),
    };
  }, [candles]);

  return (
    <div className="chart-panel">
      {/* Stat bar */}
      <div className="stat-bar">
        {[
          { label: 'Open',    val: stats.open,   color: 'var(--text-primary)' },
          { label: 'High',    val: stats.high,   color: 'var(--green)' },
          { label: 'Low',     val: stats.low,    color: 'var(--red)' },
          { label: 'Change',  val: stats.chgPct ? (stats.chgPct > 0 ? '+' : '') + stats.chgPct + '%' : '—', color: stats.chgPct > 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Volume',  val: stats.vol,    color: 'var(--text-secondary)' },
          { label: 'Signals', val: signals.length, color: 'var(--blue)' },
        ].map(({ label, val, color }) => (
          <div className="stat-item" key={label}>
            <span className="stat-label">{label}</span>
            <span className="stat-val mono" style={{ color }}>{val || '—'}</span>
          </div>
        ))}
      </div>

      {/* Chart toolbar */}
      <div className="chart-toolbar">
        <div className="chart-title">
          <span className="chart-pair">EUR/USD</span>
          <span className="chart-desc">ICT Annotated · Auto-signals</span>
        </div>
        <div className="tf-group">
          {TIMEFRAMES.map((t) => (
            <button key={t} className={`tf-btn ${tf === t ? 'active' : ''}`} onClick={() => setTf(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="chart-area">
        <TradingChart candles={candles} signals={signals} />
      </div>
    </div>
  );
}
