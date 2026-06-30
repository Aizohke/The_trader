import React, { useState, useEffect, useCallback } from 'react';
import { useWs } from '../context/WsContext';
import './IctStatus.css';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function IctStatus() {
  const { candles } = useWs();
  const [context, setContext] = useState(null);

  const fetchContext = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/candles/context`);
      setContext(await res.json());
    } catch (_) {}
  }, []);

  useEffect(() => { fetchContext(); }, [fetchContext]);
  // Refresh context every 30 seconds
  useEffect(() => {
    const t = setInterval(fetchContext, 30000);
    return () => clearInterval(t);
  }, [fetchContext]);

  const last      = candles[candles.length - 1];
  const high20    = candles.length > 20 ? Math.max(...candles.slice(-20).map(c => c.high)).toFixed(5) : '—';
  const low20     = candles.length > 20 ? Math.min(...candles.slice(-20).map(c => c.low)).toFixed(5)  : '—';
  const ctx       = context || {};
  const sweep     = ctx.activeSweep;
  const inKZ      = ctx.inKillzone;
  const kzName    = ctx.killzone;
  const htfBias   = ctx.htfBias;
  const activeFVGs = ctx.activeFVGs?.length ?? '—';

  const pipeline = [
    {
      num: 1, name: 'Killzone Filter',
      desc: inKZ ? `✓ ${kzName} — Engine active` : 'Outside killzone — engine paused until London/NY open',
      done: !!inKZ,
    },
    {
      num: 2, name: 'HTF Trend Bias (EMA 9/21)',
      desc: htfBias ? `✓ ${htfBias.toUpperCase()} bias — only ${htfBias === 'bullish' ? 'BUY' : 'SELL'} signals accepted` : 'Computing EMA 9/21 cross…',
      done: !!htfBias,
    },
    {
      num: 3, name: 'Liquidity Sweep',
      desc: sweep ? `✓ ${sweep.desc}` : 'Watching 20-candle swing highs & lows for stop hunts',
      done: !!sweep,
    },
    {
      num: 4, name: 'MSS + Volume Confirmation',
      desc: 'MSS candle must close beyond fractal AND have 1.2× average volume',
      done: false,
    },
    {
      num: 5, name: 'Fresh FVG (< 15 bars)',
      desc: `${activeFVGs} fresh FVG(s) detected within last 75 minutes`,
      done: typeof activeFVGs === 'number' && activeFVGs > 0,
    },
    {
      num: 6, name: 'Rejection Candle Confirmation',
      desc: 'Pin bar or engulfing candle required at FVG entry (wick ≥ 1.5× body)',
      done: false,
    },
  ];

  return (
    <div className="ict-status">

      {/* Pipeline */}
      <div className="ict-card">
        <div className="ict-card-title">📡 ICT Pipeline v2 — 6 Filters</div>
        {pipeline.map((s) => (
          <div key={s.num} className="pipeline-step">
            <div className={`pipeline-num ${s.done ? 'done' : 'idle'}`}>
              {s.done ? '✓' : s.num}
            </div>
            <div className="pipeline-body">
              <div className="pipeline-name">{s.name}</div>
              <div className="pipeline-desc">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Market context */}
      <div className="ict-card">
        <div className="ict-card-title">📊 Live Market Context</div>
        {[
          { label: 'Session',        val: getSessionLabel(),                        color: 'var(--blue)'   },
          { label: 'Killzone',       val: inKZ ? kzName : 'None active',            color: inKZ ? 'var(--green)' : 'var(--text-muted)' },
          { label: 'HTF Bias',       val: htfBias ? htfBias.toUpperCase() : '—',    color: htfBias === 'bullish' ? 'var(--green)' : htfBias === 'bearish' ? 'var(--red)' : 'var(--text-muted)' },
          { label: '20-Bar High',    val: high20,                                   color: 'var(--green)'  },
          { label: '20-Bar Low',     val: low20,                                    color: 'var(--red)'    },
          { label: 'Last Close',     val: last ? last.close.toFixed(5) : '—',       color: 'var(--text-primary)' },
          { label: 'Fresh FVGs',     val: activeFVGs,                               color: 'var(--amber)'  },
          { label: 'Candles Loaded', val: candles.length,                           color: 'var(--text-muted)' },
        ].map(({ label, val, color }) => (
          <div className="ctx-row" key={label}>
            <span className="ctx-label">{label}</span>
            <span className="ctx-val mono" style={{ color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Sessions */}
      <div className="ict-card">
        <div className="ict-card-title">🕐 Sessions & Killzones (UTC)</div>
        {[
          { name: '🌏 Asia',     hours: '00:00–03:00', kz: 'n/a',         note: 'Accumulation / range. Sets AMD swing lows. No trades.', key: 'asia' },
          { name: '🇬🇧 London', hours: '07:00–12:00', kz: '07:00–10:00', note: 'Primary killzone. Highest probability for ICT sweeps.', key: 'london' },
          { name: '🗽 NY',       hours: '12:00–21:00', kz: '12:00–15:00', note: 'Secondary killzone. London raid continuation or reversal.', key: 'newyork' },
        ].map((s) => (
          <div key={s.key} className={`session-row ${getActiveSession() === s.key ? 'active' : ''}`}>
            <div className="session-row-top">
              <span className="session-name">{s.name}</span>
              <span className="session-hours mono">{s.hours}</span>
            </div>
            <div className="session-kz">Killzone: <strong>{s.kz}</strong></div>
            <div className="session-note">{s.note}</div>
          </div>
        ))}
      </div>

      {/* Concept glossary */}
      <div className="ict-card">
        <div className="ict-card-title">📘 ICT Concept Reference</div>
        {CONCEPTS.map((c) => (
          <div key={c.term} className="concept-row">
            <div className="concept-term">{c.term}</div>
            <div className="concept-def">{c.def}</div>
          </div>
        ))}
      </div>

    </div>
  );
}

function getActiveSession() {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 3)   return 'asia';
  if (h >= 7 && h < 12)  return 'london';
  if (h >= 12 && h < 21) return 'newyork';
  return 'off';
}

function getSessionLabel() {
  return { asia: 'Asia', london: 'London', newyork: 'New York', off: 'Off-Hours' }[getActiveSession()];
}

const CONCEPTS = [
  { term: 'Liquidity Sweep',       def: 'Price raids a key swing high/low (stop cluster) before reversing — engineered by smart money to fill large orders at better prices.' },
  { term: 'MSS (Market Structure Shift)', def: 'A candle closes beyond a recent fractal swing point, confirming institutional intent has changed. Volume must be 1.2× average to be valid.' },
  { term: 'Fair Value Gap (FVG)',   def: '3-candle imbalance where a gap exists between candle[i-2] and candle[i]. Price returns to "fill" it. Only FVGs < 15 bars old are used.' },
  { term: 'OTE Zone',              def: '62%–79% Fibonacci retracement of an impulse leg — the optimal zone for precision entry within an FVG.' },
  { term: 'AMD Cycle',             def: 'Accumulation (Asia) → Manipulation (London sweep) → Distribution (NY trend). The engine targets the Manipulation→Distribution transition.' },
  { term: 'Killzone',              def: 'High-probability 2–3 hour windows: London Open (07–10 UTC) and NY Open (12–15 UTC). Engine is disabled outside these windows.' },
  { term: 'HTF Bias',              def: 'Higher timeframe trend direction computed from EMA 9/21 cross on the 5M buffer. Counter-trend signals are rejected entirely.' },
  { term: 'Rejection Candle',      def: 'A pin bar or engulfing candle at the FVG entry, where the wick is ≥ 1.5× the body — confirming price rejection and increasing entry precision.' },
  { term: 'Dynamic TP',            def: 'Take profit is placed just before the nearest opposing structure level between entry and the 2.5R target — avoiding TP being blocked by resistance.' },
];
