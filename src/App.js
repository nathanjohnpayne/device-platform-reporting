// App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Sidebar from './components/Sidebar';
import SiteLogo from './components/SiteLogo';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PlaybackPerformance from './pages/PlaybackPerformance';
import AdkVersionShare from './pages/AdkVersionShare';
import PartnerMigration from './pages/PartnerMigration';
import PlatformKpis from './pages/PlatformKpis';
import RegionalKpis from './pages/RegionalKpis';
import AdkVersionManager from './pages/AdkVersionManager';
import History from './pages/History';
import './styles.css';

function PageTitle({ title }) {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="topbar">
      <div className="topbar-title">{title}</div>
      <div className="topbar-meta">NCP+ADK · Disney Streaming · {today}</div>
    </div>
  );
}

const TITLES = {
  '/':                      'Dashboard',
  '/playback-performance':  'Playback Performance',
  '/adk-version-share':     'ADK Version Share',
  '/partner-migration':     'Partner Migration Status',
  '/platform-kpis':         'Platform KPIs',
  '/regional-kpis':         'Regional KPIs',
  '/adk-versions':          'ADK Version Manager',
  '/history':               'Historical Data',
};

function AppShell() {
  const { user, loading } = useAuth();
  const path = window.location.pathname;

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4f8' }}>
        <div style={{ textAlign: 'center' }}>
          <SiteLogo className="loading-logo" />
          <div style={{ fontSize: 14, color: '#64748b' }}>Loading NCP+ADK KPI Dashboard…</div>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  const title = TITLES[path] || 'NCP+ADK KPIs';

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <PageTitle title={title} />
        <div className="page-body">
          <Routes>
            <Route path="/"                      element={<Dashboard />} />
            <Route path="/playback-performance"  element={<PlaybackPerformance />} />
            <Route path="/adk-version-share"     element={<AdkVersionShare />} />
            <Route path="/partner-migration"     element={<PartnerMigration />} />
            <Route path="/platform-kpis"         element={<PlatformKpis />} />
            <Route path="/regional-kpis"         element={<RegionalKpis />} />
            <Route path="/adk-versions"          element={<AdkVersionManager />} />
            <Route path="/history"               element={<History />} />
            <Route path="*"                      element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  );
}
