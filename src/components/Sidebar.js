// components/Sidebar.js
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import SiteLogo from './SiteLogo';

const weekly = [
  { to: '/playback-performance',   icon: '📊', label: 'Playback Performance' },
  { to: '/adk-version-share',      icon: '🥧', label: 'ADK Version Share' },
  { to: '/partner-migration',      icon: '🔄', label: 'Partner Migration' },
];
const monthly = [
  { to: '/platform-kpis',          icon: '📈', label: 'Platform & Regional KPIs' },
];
const admin = [
  { to: '/adk-versions',           icon: '⚙️', label: 'ADK Version Manager' },
  { to: '/partner-region-mapping', icon: '🗺️', label: 'Partner Region Mapping' },
  { to: '/legacy-sync',            icon: '📚', label: 'Legacy Workbook Sync' },
  { to: '/history',                icon: '🗂️', label: 'Historical Data' },
];

export default function Sidebar() {
  const { user, signOut } = useAuth();

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-brand">
          <SiteLogo className="sidebar-brand-mark" />
          <div className="sidebar-brand-copy">
            <h1>NCP+ADK<br/>Program KPIs</h1>
            <p>Disney Streaming</p>
          </div>
        </div>
      </div>

      <div className="nav-group">
        <div className="nav-group-label">Home</div>
        <NavLink className={({isActive})=>'nav-item'+(isActive?' active':'')} to="/" end>
          <span className="nav-icon">🏠</span> Dashboard
        </NavLink>
      </div>

      <div className="nav-group">
        <div className="nav-group-label">Weekly</div>
        {weekly.map(n => (
          <NavLink key={n.to} className={({isActive})=>'nav-item'+(isActive?' active':'')} to={n.to}>
            <span className="nav-icon">{n.icon}</span> {n.label}
          </NavLink>
        ))}
      </div>

      <div className="nav-group">
        <div className="nav-group-label">Monthly</div>
        {monthly.map(n => (
          <NavLink key={n.to} className={({isActive})=>'nav-item'+(isActive?' active':'')} to={n.to}>
            <span className="nav-icon">{n.icon}</span> {n.label}
          </NavLink>
        ))}
      </div>

      <div className="nav-group">
        <div className="nav-group-label">Manage</div>
        {admin.map(n => (
          <NavLink key={n.to} className={({isActive})=>'nav-item'+(isActive?' active':'')} to={n.to}>
            <span className="nav-icon">{n.icon}</span> {n.label}
          </NavLink>
        ))}
      </div>

      <div className="sidebar-user">
        {user?.photoURL && <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />}
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user?.displayName || 'User'}</div>
          <div className="sidebar-user-email">{user?.email}</div>
        </div>
        <button className="btn-signout" onClick={signOut} title="Sign out">↩</button>
      </div>
    </nav>
  );
}
