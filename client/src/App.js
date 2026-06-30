import React, { useState } from 'react';
import { WsProvider } from './context/WsContext';
import Header    from './components/Header';
import ChartPanel from './components/ChartPanel';
import SidePanel  from './components/SidePanel';
import Toast      from './components/Toast';
import './App.css';

export default function App() {
  const [sideTab, setSideTab] = useState('signals');
  return (
    <WsProvider>
      <div className="app">
        <Header />
        <div className="app-body">
          <main className="main-panel">
            <ChartPanel />
          </main>
          <aside className="side-panel-wrap">
            <SidePanel activeTab={sideTab} onTabChange={setSideTab} />
          </aside>
        </div>
        <Toast />
      </div>
    </WsProvider>
  );
}
