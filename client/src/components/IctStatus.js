import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useWs } from '../context/WsContext';
import './IctStatus.css';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function IctStatus() {
  const { candles } = useWs();
  const [context, setContext] = useState(null);

  useEffect(() => {
    axios.get(`${BASE}/api/candles/context`)
      .then((r) => setContext(r.data))
      .catch(() => {});
  }, []);

  // Compute live state from candle buffer
  const last      = candles[candles.length - 1];
  const high20    = candles.length > 20 ? Math.max(...candles.slice(-20).map((c) => c.high)).toFixed(5) : '—';
  const low20     = candles.length > 20 ? Math.min(...candles.slice(-20).map((c) => c.low)).toFixed(5)  : '—';
  const activeFVGs = context?.activeFVGs?.length ?? '—';
  const session    = context?.session ?? getSessionLabel(getActiveSession());
  const sweep      = context?.activeSweep;

  const pipelineSteps = [
    {
      num: 1, name: 'Liquidity Sweep',
      desc: sweep ? sweep.desc : 'Watching 20-candle swing highs & lows for stop hunts',
      done: !!sweep,
    },
    {
      num: 2, name: 'Market Structure Shift',
      desc: sweep ? 'Monitoring for fractal break to confirm reversal intent' : 'Awaiting sweep first',
      done: false,
    },
    {
      num: 3, name: 'Fair Value Gap',
      desc: `${activeFVGs} FVG(s) detected — price may retrace to fill imbalance`,
      done: activeFVGs > 0,
    },
    {
      num: 4, name: 'Signal Generated',
      desc: 'All 3 conditions must align sequentially to fire a trade signal',
      done: false,
    },
  ];

  return (
    <div className="ict-status">

      {/* Pipeline */}
      <div className="ict-card">
        <div className="ict-card-title">📡 ICT Pipeline Monitor</div>
        {pipelineSteps.map((s) => (
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
        <div className="ict-card-title">📊 Market Context</div>
        {[
          { label: 'Active Session', val: sessionLabel(getActiveSession()), color: 'var(--blue)' },
          { label: '20-Candle High', val: high20, color: 'var(--green)' },
          { label: '20-Candle Low',  val: low20,  color: 'var(--red)' },
          { label: 'Last Close',     val: last ? last.close.toFixed(5) : '—', color: 'var(--text-primary)' },
          { label: 'Active FVGs',    val: activeFVGs, color: 'var(--amber)' },
          { label: 'Candles Loaded', val: candles.length, color: 'var(--text-muted)' },
        ].map(({ label, val, color }) => (
          <div className="ctx-row" key={label}>
            <span className="ctx-label">{label}</span>
            <span className="ctx-val mono" style={{ color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Sessions guide */}
      <div className="ict-card">
        <div className="ict-card-title">🕐 Trading Sessions (UTC)</div>
        {[
          { name: '🌏 Asia',      hours: '00:00 – 03:00', note: 'Accumulation, range-bound. Sets AMD lows.',  key: 'asia' },
          { name: '🇬🇧 London',   hours: '07:00 – 12:00', note: 'High volatility. Liquidity sweeps. Prime killzone.', key: 'london' },
          { name: '🗽 New York',  hours: '12:00 – 21:00', note: 'Continuation or reversal. London session raid.', key: 'newyork' },
        ].map((s) => (
          <div key={s.key} className={`session-row ${getActiveSession() === s.key ? 'active' : ''}`}>
            <div className="session-row-top">
              <span className="session-name">{s.name}</span>
              <span className="session-hours mono">{s.hours}</span>
            </div>
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

function sessionLabel(s) {
  return { asia: 'Asia', london: 'London', newyork: 'New York', off: 'Off-Hours' }[s] || s;
}

const CONCEPTS = [
  { term: 'Liquidity Sweep',         def: 'Price raids a key high/low (stop clusters) before reversing — engineered by smart money to fill orders.' },
  { term: 'MSS (Market Structure Shift)', def: 'A candle closes beyond a recent fractal swing, confirming that institutional intent has changed direction.' },
  { term: 'Fair Value Gap (FVG)',     def: '3-candle imbalance where a gap exists between candle[i-2] and candle[i]. Price returns to "fill" the gap.' },
  { term: 'OTE (Optimal Trade Entry)', def: 'The 62%–79% Fibonacci retracement of an impulse leg — ideal precision entry zone within an FVG.' },
  { term: 'AMD (Accumulation–Manipulation–Distribution)', def: 'The 3-phase daily cycle: Asia accumulates, London manipulates (sweeps), NY distributes (trends).' },
  { term: 'PDHL (Previous Day High/Low)', def: 'Key reference levels. Smart money often targets PDHL for liquidity before reversing.' },
  { term: 'Killzone',                 def: 'High-probability 1-2 hour windows around session opens (London 07–09 UTC, NY 12–14 UTC) where setups form.' },
];
