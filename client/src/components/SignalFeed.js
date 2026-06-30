import React, { useState } from 'react';
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
          The ICT engine only fires during London (07–10 UTC) and New York (12–15 UTC) killzones.
          All 6 filters must pass: Killzone → HTF Bias → Sweep → MSS (vol) → Fresh FVG → Rejection candle.
        </p>
      </div>
    );
  }

  return (
    <div className="signal-feed">
      {signals.map((sig, i) => (
        <SignalCard key={sig._id || i} signal={sig} isNew={i === 0} />
      ))}
    </div>
  );
}

function SignalCard({ signal, isNew }) {
  const { deleteSignal, updateSignal } = useWs();
  const [deleting,  setDeleting]  = useState(false);
  const [confirmDel,setConfirmDel]= useState(false);
  const [editing,   setEditing]   = useState(false);
  const [pips,      setPips]      = useState('');
  const [busy,      setBusy]      = useState(false);

  const bull = signal.direction === 'BUY';
  const time = signal.createdAt
    ? new Date(signal.createdAt).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try { await deleteSignal(signal._id); }
    catch (e) { console.error(e); setDeleting(false); setConfirmDel(false); }
  };

  const handleOutcome = async (outcome) => {
    setBusy(true);
    try {
      const p = pips !== '' ? parseFloat(pips) : (outcome === 'WIN' ? signal.tpPips : -(signal.slPips));
      await updateSignal(signal._id, { outcome, pips: p });
      setEditing(false);
    } catch (e) { console.error(e); }
    setBusy(false);
  };

  return (
    <div className={`signal-card ${bull ? 'bull' : 'bear'} ${isNew ? 'new' : ''}`}>
      {/* Header row */}
      <div className="sc-header">
        <div className="sc-header-left">
          <span className={`dir-badge ${bull ? 'badge-buy' : 'badge-sell'}`}>
            {bull ? '▲' : '▼'} {signal.direction}
          </span>
          {signal.killzone && <span className="kz-badge">{signal.killzone}</span>}
          {signal.hasConfirmation && <span className="conf-badge">✓ Conf</span>}
        </div>
        <div className="sc-header-right">
          <span className="sc-time mono">{time}</span>
          {/* Delete button */}
          <button
            className={`del-btn ${confirmDel ? 'del-confirm' : ''}`}
            onClick={handleDelete}
            disabled={deleting}
            title={confirmDel ? 'Click again to confirm delete' : 'Delete signal'}
          >
            {deleting ? '…' : confirmDel ? 'Confirm?' : '✕'}
          </button>
          {confirmDel && !deleting && (
            <button className="del-cancel" onClick={() => setConfirmDel(false)}>Cancel</button>
          )}
        </div>
      </div>

      {/* Price grid */}
      <div className="sc-grid">
        <div className="sc-cell">
          <span className="sc-lbl">Entry</span>
          <span className="sc-val mono" style={{ color: 'var(--blue)' }}>{signal.entry}</span>
        </div>
        <div className="sc-cell">
          <span className="sc-lbl">R:R</span>
          <span className="rr-badge mono">1:{signal.rr}</span>
        </div>
        <div className="sc-cell">
          <span className="sc-lbl">Stop Loss</span>
          <span className="sc-val mono" style={{ color: 'var(--red)' }}>
            {signal.sl} <small>({signal.slPips}p)</small>
          </span>
        </div>
        <div className="sc-cell">
          <span className="sc-lbl">Take Profit</span>
          <span className="sc-val mono" style={{ color: 'var(--green)' }}>
            {signal.tp} <small>({signal.tpPips}p)</small>
          </span>
        </div>
      </div>

      {/* FVG zone */}
      <div className="sc-fvg">
        <span className="sc-lbl">FVG Zone</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>
          {signal.fvgBottom} – {signal.fvgTop}
        </span>
      </div>

      {/* ICT conditions */}
      <div className="sc-conditions">
        {[
          { label: signal.conditions?.sweep || 'Liquidity Sweep',      ok: !!signal.conditions?.sweep },
          { label: signal.conditions?.mss   || 'Market Structure Shift',ok: !!signal.conditions?.mss   },
          { label: signal.conditions?.fvg   || 'Fair Value Gap',        ok: !!signal.conditions?.fvg   },
          { label: `HTF Bias: ${signal.htfBias || 'n/a'}`,             ok: !!signal.htfBias },
          { label: `Session: ${(signal.session || '').toUpperCase()}`,  ok: true },
        ].map((c, i) => (
          <div key={i} className="cond-row">
            <span className={`cond-dot ${c.ok ? 'ok' : 'na'}`} />
            <span style={{ color: c.ok ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: 11 }}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Outcome */}
      <div className="sc-outcome-row">
        {signal.outcome === 'PENDING' ? (
          editing ? (
            <div className="outcome-edit">
              <input
                className="pips-input"
                type="number"
                placeholder="pips"
                value={pips}
                onChange={(e) => setPips(e.target.value)}
              />
              <button className="oc-btn win"    onClick={() => handleOutcome('WIN')}  disabled={busy}>WIN</button>
              <button className="oc-btn loss"   onClick={() => handleOutcome('LOSS')} disabled={busy}>LOSS</button>
              <button className="oc-btn cancel" onClick={() => setEditing(false)}>✕</button>
            </div>
          ) : (
            <button className="pending-btn" onClick={() => setEditing(true)}>
              ⏳ Mark Outcome
            </button>
          )
        ) : (
          <span className={`outcome-pill ${signal.outcome === 'WIN' ? 'win' : 'loss'}`}>
            {signal.outcome === 'WIN' ? '✓' : '✗'} {signal.outcome}
            {signal.pips ? ` ${signal.pips > 0 ? '+' : ''}${signal.pips}p` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
