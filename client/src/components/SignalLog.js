import React, { useState, useEffect, useCallback } from 'react';
import { useWs } from '../context/WsContext';
import './SignalLog.css';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function SignalLog() {
  const { deleteSignal, updateSignal } = useWs();
  const [data,    setData]    = useState({ signals: [], stats: {}, pagination: {} });
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState({ direction: '', outcome: '' });
  const [page,    setPage]    = useState(1);
  const [clearing,setClearing]= useState(false);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 15 });
      if (filter.direction) params.set('direction', filter.direction);
      if (filter.outcome)   params.set('outcome',   filter.outcome);
      const res  = await fetch(`${BASE}/api/signals?${params}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('Fetch signals:', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  const handleDelete = async (id) => {
    try { await deleteSignal(id); fetchSignals(); }
    catch (e) { console.error(e); }
  };

  const handleUpdate = async (id, body) => {
    try { await updateSignal(id, body); fetchSignals(); }
    catch (e) { console.error(e); }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Delete ALL signals? This cannot be undone.')) return;
    setClearing(true);
    try {
      await fetch(`${BASE}/api/signals`, { method: 'DELETE' });
      fetchSignals();
    } catch (e) { console.error(e); }
    setClearing(false);
  };

  const { signals = [], stats = {}, pagination = {} } = data;

  return (
    <div className="log-panel">
      {/* Stats */}
      <div className="log-stats">
        {[
          { label: 'Total',    val: stats.total || 0,                                                                 color: 'var(--text-primary)' },
          { label: 'Win Rate', val: (stats.winRate || '0') + '%',                                                    color: 'var(--green)' },
          { label: 'Net Pips', val: stats.netPips ? (parseFloat(stats.netPips) > 0 ? '+' : '') + stats.netPips : '—', color: parseFloat(stats.netPips) >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Pending',  val: stats.pending || 0,                                                               color: 'var(--amber)' },
        ].map(({ label, val, color }) => (
          <div className="log-stat" key={label}>
            <span className="log-stat-lbl">{label}</span>
            <span className="log-stat-val mono" style={{ color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Filters + actions */}
      <div className="log-filters">
        <select className="log-select" value={filter.direction} onChange={(e) => { setFilter((f) => ({ ...f, direction: e.target.value })); setPage(1); }}>
          <option value="">All Directions</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <select className="log-select" value={filter.outcome} onChange={(e) => { setFilter((f) => ({ ...f, outcome: e.target.value })); setPage(1); }}>
          <option value="">All Outcomes</option>
          <option value="PENDING">Pending</option>
          <option value="WIN">Win</option>
          <option value="LOSS">Loss</option>
        </select>
        <button className="log-refresh" onClick={fetchSignals} title="Refresh">↻</button>
        <button className="log-clear-all" onClick={handleClearAll} disabled={clearing} title="Delete all signals">
          {clearing ? '…' : '🗑'}
        </button>
      </div>

      {/* Table */}
      <div className="log-table-wrap">
        {loading ? (
          <div className="log-state">Loading…</div>
        ) : signals.length === 0 ? (
          <div className="log-state">No signals found.</div>
        ) : (
          <table className="log-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Dir</th>
                <th>Entry</th>
                <th>SL</th>
                <th>TP</th>
                <th>RR</th>
                <th>KZ</th>
                <th>Outcome</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {signals.map((sig) => (
                <LogRow
                  key={sig._id}
                  sig={sig}
                  onDelete={() => handleDelete(sig._id)}
                  onUpdate={(body) => handleUpdate(sig._id, body)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="log-pagination">
          <button className="pg-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
          <span className="pg-info">{page} / {pagination.pages}</span>
          <button className="pg-btn" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
        </div>
      )}
    </div>
  );
}

function LogRow({ sig, onDelete, onUpdate }) {
  const [editing,   setEditing]   = useState(false);
  const [pips,      setPips]      = useState('');
  const [busy,      setBusy]      = useState(false);
  const [confirmDel,setConfirmDel]= useState(false);
  const bull = sig.direction === 'BUY';
  const time = sig.createdAt
    ? new Date(sig.createdAt).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const submit = async (outcome) => {
    setBusy(true);
    const p = pips !== '' ? parseFloat(pips) : (outcome === 'WIN' ? sig.tpPips : -(sig.slPips));
    await onUpdate({ outcome, pips: p });
    setEditing(false);
    setBusy(false);
  };

  return (
    <tr className={editing ? 'row-editing' : ''}>
      <td className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{time}</td>
      <td>
        <span className={`dir-badge-sm ${bull ? 'buy' : 'sell'}`}>{bull ? '▲' : '▼'} {sig.direction}</span>
      </td>
      <td className="mono">{sig.entry}</td>
      <td className="mono" style={{ color: 'var(--red)' }}>{sig.sl}</td>
      <td className="mono" style={{ color: 'var(--green)' }}>{sig.tp}</td>
      <td className="mono" style={{ color: 'var(--blue)' }}>1:{sig.rr}</td>
      <td style={{ fontSize: 9, color: 'var(--text-muted)' }}>{sig.killzone?.replace(' Open', '') || sig.session || '—'}</td>
      <td>
        {sig.outcome === 'PENDING' ? (
          editing ? (
            <div className="outcome-edit">
              <input className="pips-input" type="number" placeholder="pips" value={pips} onChange={(e) => setPips(e.target.value)} />
              <button className="oc-btn win"    onClick={() => submit('WIN')}  disabled={busy}>W</button>
              <button className="oc-btn loss"   onClick={() => submit('LOSS')} disabled={busy}>L</button>
              <button className="oc-btn cancel" onClick={() => setEditing(false)}>✕</button>
            </div>
          ) : (
            <button className="pending-btn" onClick={() => setEditing(true)}>Pending</button>
          )
        ) : (
          <span className={`outcome-pill ${sig.outcome === 'WIN' ? 'win' : 'loss'}`}>
            {sig.outcome} {sig.pips ? (sig.pips > 0 ? '+' : '') + sig.pips + 'p' : ''}
          </span>
        )}
      </td>
      <td>
        <button
          className={`row-del ${confirmDel ? 'row-del-confirm' : ''}`}
          onClick={() => { if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); } else onDelete(); }}
          title={confirmDel ? 'Click to confirm delete' : 'Delete'}
        >
          {confirmDel ? '!' : '✕'}
        </button>
      </td>
    </tr>
  );
}
