import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './SignalLog.css';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function SignalLog() {
  const [data,    setData]    = useState({ signals: [], stats: {}, pagination: {} });
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState({ direction: '', outcome: '' });
  const [page,    setPage]    = useState(1);
  const [updating, setUpdating] = useState(null);

  const fetchSignals = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15, ...filter };
      Object.keys(params).forEach((k) => !params[k] && delete params[k]);
      const res = await axios.get(`${BASE}/api/signals`, { params });
      setData(res.data);
    } catch (e) {
      console.error('Fetch signals error:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSignals(); }, [page, filter]);

  const updateOutcome = async (id, outcome, pips) => {
    setUpdating(id);
    try {
      await axios.patch(`${BASE}/api/signals/${id}`, { outcome, pips: parseFloat(pips) });
      fetchSignals();
    } catch (e) {
      console.error(e.message);
    } finally {
      setUpdating(null);
    }
  };

  const { signals = [], stats = {}, pagination = {} } = data;

  return (
    <div className="log-panel">
      {/* Stats bar */}
      <div className="log-stats">
        {[
          { label: 'Total', val: stats.total || 0, color: 'var(--text-primary)' },
          { label: 'Win Rate', val: (stats.winRate || '0') + '%', color: 'var(--green)' },
          { label: 'Net Pips', val: stats.netPips ? (parseFloat(stats.netPips) > 0 ? '+' : '') + stats.netPips : '—', color: parseFloat(stats.netPips) >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Pending', val: stats.pending || 0, color: 'var(--amber)' },
        ].map(({ label, val, color }) => (
          <div className="log-stat" key={label}>
            <span className="log-stat-lbl">{label}</span>
            <span className="log-stat-val mono" style={{ color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
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
        <button className="log-refresh" onClick={fetchSignals}>↻</button>
      </div>

      {/* Table */}
      <div className="log-table-wrap">
        {loading ? (
          <div className="log-loading">Loading signals…</div>
        ) : signals.length === 0 ? (
          <div className="log-empty">No signals match your filters.</div>
        ) : (
          <table className="log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Dir</th>
                <th>Entry</th>
                <th>SL</th>
                <th>TP</th>
                <th>R:R</th>
                <th>Session</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((sig) => (
                <LogRow key={sig._id} sig={sig} onUpdate={updateOutcome} updating={updating === sig._id} />
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

function LogRow({ sig, onUpdate, updating }) {
  const [editing, setEditing] = useState(false);
  const [pips,    setPips]    = useState('');
  const bull = sig.direction === 'BUY';
  const time = sig.createdAt ? new Date(sig.createdAt).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const submit = (outcome) => {
    onUpdate(sig._id, outcome, pips || (outcome === 'WIN' ? sig.tpPips : -sig.slPips));
    setEditing(false);
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
      <td style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{sig.session || '—'}</td>
      <td>
        {sig.outcome === 'PENDING' ? (
          editing ? (
            <div className="outcome-edit">
              <input
                className="pips-input"
                type="number"
                placeholder="pips"
                value={pips}
                onChange={(e) => setPips(e.target.value)}
              />
              <button className="oc-btn win" onClick={() => submit('WIN')} disabled={updating}>W</button>
              <button className="oc-btn loss" onClick={() => submit('LOSS')} disabled={updating}>L</button>
              <button className="oc-btn cancel" onClick={() => setEditing(false)}>✕</button>
            </div>
          ) : (
            <button className="pending-btn" onClick={() => setEditing(true)}>
              {updating ? '…' : 'Pending'}
            </button>
          )
        ) : (
          <span className={`outcome-pill ${sig.outcome === 'WIN' ? 'win' : 'loss'}`}>
            {sig.outcome} {sig.pips ? (sig.pips > 0 ? '+' : '') + sig.pips + 'p' : ''}
          </span>
        )}
      </td>
    </tr>
  );
}
