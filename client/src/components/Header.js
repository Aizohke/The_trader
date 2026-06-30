import React from 'react';
import { useWs } from '../context/WsContext';
import { useNotifications } from '../hooks/useNotifications';
import './Header.css';

export default function Header() {
  const { ticker, connected, signals, liveBar } = useWs();
  const { permission, requestPermission }        = useNotifications();
  const session = getActiveSession();

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">The Trader</span>
          <span className="logo-sub">ICT v2</span>
        </div>
        <div className="header-divider" />
        <div className="pair-block">
          <span className="pair-name">EUR/USD</span>
          <span className="pair-tf">
            5M · Twelve Data{liveBar ? ' · Live' : ''}
          </span>
        </div>
      </div>

      <div className="header-center">
        <span className="ticker-price mono">{ticker.price || '—'}</span>
        <span className={`ticker-change mono ${ticker.dir === 'up' ? 'text-up' : 'text-dn'}`}>
          {ticker.dir === 'up' ? '▲' : '▼'}{' '}
          {ticker.change > 0 ? '+' : ''}{Number(ticker.change || 0).toFixed(5)}
        </span>
      </div>

      <div className="header-right">
        <div className={`session-chip session-${session}`}>
          {SESSION_LABELS[session]}
        </div>

        <div className="header-meta-item">
          <span className="meta-label">Signals</span>
          <span className="meta-val text-blue mono">{signals.length}</span>
        </div>

        {/* Notification permission button */}
        {permission !== 'granted' && (
          <button
            className="notif-btn"
            onClick={requestPermission}
            title="Enable push notifications for trade alerts"
          >
            🔔 Enable Alerts
          </button>
        )}
        {permission === 'granted' && (
          <span className="notif-active" title="Push notifications active">
            🔔 Alerts On
          </span>
        )}

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
  if (h >= 0  && h < 3)  return 'asia';
  if (h >= 7  && h < 12) return 'london';
  if (h >= 12 && h < 21) return 'newyork';
  return 'off';
}

const SESSION_LABELS = {
  asia:     '🌏 Asia',
  london:   '🇬🇧 London',
  newyork:  '🗽 New York',
  off:      '💤 Off-Hours',
};
