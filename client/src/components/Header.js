import React from 'react';
import { useWs } from '../context/WsContext';
import './Header.css';

export default function Header() {
  const { ticker, connected, signals, liveBar } = useWs();
  const session = getActiveSession();

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">The Trader</span>
          <span className="logo-sub">ICT Dashboard</span>
        </div>
        <div className="header-divider" />
        <div className="pair-block">
          <span className="pair-name">EUR/USD</span>
          <span className="pair-tf">5M · Twelve Data{liveBar ? ' · Live' : ''}</span>
        </div>
      </div>

      <div className="header-center">
        <div className="ticker-price mono">{ticker.price || '—'}</div>
        <div className={`ticker-change mono ${ticker.dir === 'up' ? 'text-up' : 'text-dn'}`}>
          {ticker.dir === 'up' ? '▲' : '▼'}{' '}
          {ticker.change > 0 ? '+' : ''}{Number(ticker.change).toFixed(5)}
        </div>
      </div>

      <div className="header-right">
        <div className={`session-chip session-${session}`}>
          {sessionLabel(session)}
        </div>
        <div className="header-meta-item">
          <span className="meta-label">Signals</span>
          <span className="meta-val text-blue mono">{signals.length}</span>
        </div>
        <div className={`ws-status ${connected ? 'ws-on' : 'ws-off'}`}>
          <span className="ws-dot" />
          {connected ? 'Live' : 'Reconnecting…'}
        </div>
      </div>
    </header>
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
  return {
    asia:     '🌏 Asia',
    london:   '🇬🇧 London',
    newyork:  '🗽 New York',
    off:      '💤 Off-Hours',
  }[s];
}
