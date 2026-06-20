import React from 'react';
import { useWs } from '../context/WsContext';
import './SignalFeed.css';

export default function SignalFeed() {
  const { signals } = useWs();

  if (!signals.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📡</div>
        <div className="empty-title">Scanning for setups…</div>
        <p className="empty-sub">
          The ICT engine monitors every candle. A signal fires only when
          Liquidity Sweep → MSS → FVG align in sequence.
        </p>
      </div>
    );
  }

  return (
    <div className="signal-feed">
      {signals.map((sig, i) => (
        <SignalCard key={sig._id || sig.id || i} signal={sig} isNew={i === 0} />
      ))}
    </div>
  );
}

function SignalCard({ signal, isNew }) {
  const bull = signal.direction === 'BUY';
  const time = signal.createdAt
    ? new Date(signal.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : signal.time || '';

  return (
    <div className={`signal-card ${bull ? 'bull' : 'bear'} ${isNew ? 'new' : ''}`}>
      {/* Header */}
      <div className="sc-header">
        <span className={`dir-badge ${bull ? 'badge-buy' : 'badge-sell'}`}>
          {bull ? '▲' : '▼'} {signal.direction}
        </span>
        <span className="sc-time mono">{time}</span>
      </div>

      {/* Grid */}
      <div className="sc-grid">
        <div className="sc-cell">
          <span className="sc-lbl">Entry</span>
          <span className="sc-val mono" style={{ color: '#3b82f6' }}>{signal.entry}</span>
        </div>
        <div className="sc-cell">
          <span className="sc-lbl">R:R</span>
          <span className="rr-badge mono">1:{signal.rr}</span>
        </div>
        <div className="sc-cell">
          <span className="sc-lbl">Stop Loss</span>
          <span className="sc-val mono" style={{ color: 'var(--red)' }}>{signal.sl} <small>({signal.slPips}p)</small></span>
        </div>
        <div className="sc-cell">
          <span className="sc-lbl">Take Profit</span>
          <span className="sc-val mono" style={{ color: 'var(--green)' }}>{signal.tp} <small>({signal.tpPips}p)</small></span>
        </div>
      </div>

      {/* FVG zone */}
      <div className="sc-fvg">
        <span className="sc-lbl">FVG Zone</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>
          {signal.fvgBottom} – {signal.fvgTop}
        </span>
      </div>

      {/* Conditions */}
      <div className="sc-conditions">
        {[
          { label: signal.conditions?.sweep || 'Liquidity Sweep', ok: !!signal.conditions?.sweep },
          { label: signal.conditions?.mss   || 'Market Structure Shift', ok: !!signal.conditions?.mss },
          { label: signal.conditions?.fvg   || 'Fair Value Gap', ok: !!signal.conditions?.fvg },
        ].map((c, i) => (
          <div key={i} className="cond-row">
            <span className={`cond-dot ${c.ok ? 'ok' : 'na'}`} />
            <span className={c.ok ? '' : 'text-muted'}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Session */}
      {signal.session && (
        <div className="sc-session">
          Session: <strong>{signal.session.toUpperCase()}</strong>
          {signal.outcome && signal.outcome !== 'PENDING' && (
            <span className={`outcome-pill ${signal.outcome === 'WIN' ? 'win' : 'loss'}`}>
              {signal.outcome} {signal.pips ? (signal.pips > 0 ? '+' : '') + signal.pips + 'p' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
