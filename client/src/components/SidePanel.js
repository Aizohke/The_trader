import React from 'react';
import { useWs } from '../context/WsContext';
import SignalFeed from './SignalFeed';
import SignalLog  from './SignalLog';
import IctStatus  from './IctStatus';
import './SidePanel.css';

const TABS = [
  { key: 'signals', label: '⚡ Signals' },
  { key: 'log',     label: '📋 Log'     },
  { key: 'ict',     label: '🧠 ICT'     },
];

export default function SidePanel({ activeTab, onTabChange }) {
  const { signals } = useWs();

  return (
    <div className="side-panel-inner">
      <div className="side-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`side-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => onTabChange(t.key)}
          >
            {t.label}
            {t.key === 'signals' && signals.length > 0 && (
              <span className="tab-badge">{signals.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'signals' && <SignalFeed />}
        {activeTab === 'log'     && <SignalLog  />}
        {activeTab === 'ict'     && <IctStatus  />}
      </div>
    </div>
  );
}
