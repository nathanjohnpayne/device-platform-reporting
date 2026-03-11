// pages/Dashboard.js
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const workflows = [
  {
    to: '/playback-performance',
    icon: '📊',
    badge: 'Weekly',
    badgeCls: 'badge-weekly',
    title: 'Playback Performance',
    desc: 'Upload Conviva CSV. Generates VSF-T, VPF-T, Attempts, and Unique Devices charts with narrative copy.',
    source: 'Conviva',
  },
  {
    to: '/adk-version-share',
    icon: '🥧',
    badge: 'Weekly',
    badgeCls: 'badge-weekly',
    title: 'ADK Version Share',
    desc: 'Upload Conviva CSV. Generates ADK version pie chart, device share percentages, and Confluence-ready output.',
    source: 'Conviva',
  },
  {
    to: '/partner-migration',
    icon: '🔄',
    badge: 'Weekly',
    badgeCls: 'badge-weekly',
    title: 'Partner Migration Status',
    desc: 'Upload Sentry CSV. Identifies partners with legacy ADK versions and calculates migration percentages.',
    source: 'Sentry',
  },
  {
    to: '/platform-kpis',
    icon: '📈',
    badge: 'Monthly',
    badgeCls: 'badge-monthly',
    title: 'Platform & Regional KPIs',
    desc: 'Upload the monthly Looker zip. Builds platform KPIs plus estimated regional MAU, MAD, and Playback Hours using the partner mapping model.',
    source: 'Looker',
  },
  {
    to: '/adk-versions',
    icon: '⚙️',
    badge: 'Admin',
    badgeCls: 'badge-admin',
    title: 'ADK Version Manager',
    desc: 'Add or edit ADK version → core_version mappings used across all partner migration and version share workflows.',
    source: 'Firestore',
  },
  {
    to: '/partner-region-mapping',
    icon: '🗺️',
    badge: 'Admin',
    badgeCls: 'badge-admin',
    title: 'Partner Region Mapping',
    desc: 'Import the Sheet 1 CSV used to map partners and dashboard aliases into the regional estimation workflow.',
    source: 'Google Sheets / Firestore',
  },
  {
    to: '/legacy-sync',
    icon: '📚',
    badge: 'Admin',
    badgeCls: 'badge-admin',
    title: 'Legacy Workbook Sync',
    desc: 'Import the historical Google Sheets workbooks and export merged replacement files with legacy + app-collected data.',
    source: 'Excel / Firestore',
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div>
      <div className="card" style={{ background: 'linear-gradient(135deg, #0f2744, #1e3a5f)', border: 'none', marginBottom: 24 }}>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6 }}>{today}</div>
        <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          Good morning, {user?.displayName?.split(' ')[0] || 'there'} 👋
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.6 }}>
          NCP+ADK Program Weekly KPIs · Disney Streaming<br/>
          Upload your exports below to generate Confluence-ready charts and tables.
        </p>
      </div>

      <div className="alert alert-info">
        ℹ️ <span><strong>Monday morning workflow:</strong> Run Playback Performance, ADK Version Share, and Partner Migration each week before the 10:00 AM PT program meeting. Platform &amp; Regional KPIs are updated monthly from the Looker export plus the partner-region mapping.</span>
      </div>

      <div className="workflow-grid">
        {workflows.map(w => (
          <Link key={w.to} to={w.to} className="workflow-card">
            <div className="workflow-card-icon">{w.icon}</div>
            <h3>{w.title}</h3>
            <p>{w.desc}</p>
            <div className="workflow-card-footer">
              <span className={`section-badge ${w.badgeCls}`}>{w.badge}</span>
              <span className="text-muted">Source: {w.source} →</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title">📚 Reference Links</div>
        <div className="card-subtitle">Source dashboards for all data exports</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <a className="source-link" href="https://pulse.conviva.com/app/custom-dashboards/dashboard/48643?data-source=ei" target="_blank" rel="noreferrer">📊 Conviva: Playback Performance</a>
          <a className="source-link" href="https://pulse.conviva.com/app/custom-dashboards/dashboard/28764?data-source=ei" target="_blank" rel="noreferrer">🥧 Conviva: ADK Version Comparisons</a>
          <a className="source-link" href="https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Device+Family=rust" target="_blank" rel="noreferrer">📈 Looker: D+ Device Health Dashboard</a>
          <a className="source-link" href="https://disney.my.sentry.io/organizations/disney/explore/discover/results/?field=partner&field=device&field=core_version&field=count_unique%28device_id%29&field=count%28%29&name=ADK%20Partner%20-%20Device%20Combinations&project=23&query=%21partner%3Arefapp%20%21partner%3Abroadcom%20%21partner%3Avpe%20title%3Alaunch%20%21partner%3Adss%20%21partner%3Atwdc_microsoft%20%21partner%3Atwdc_amazon&sort=-count_unique_device_id&statsPeriod=24h&yAxis=count_unique%28device_id%29&yAxis=count%28%29" target="_blank" rel="noreferrer">🔄 Sentry: ADK Partner-Device Combos</a>
          <a className="source-link" href="https://docs.google.com/spreadsheets/d/1gla_k5-dERGc10XwS1R56E_69FAFreXRjVso_LEuYoU/edit?gid=0#gid=0" target="_blank" rel="noreferrer">🗺️ Google Sheets: Partner Region Mapping</a>
          <a className="source-link" href="https://docs.google.com/spreadsheets/d/1Ic6Uicee5VJezKn9BSYiSyb9BBKZjN04PGNI5Eqrml0/edit" target="_blank" rel="noreferrer">📋 Google Sheets: Historical KPIs</a>
          <a className="source-link" href="https://docs.google.com/spreadsheets/d/1dDRQ9Mj0A6HGr4uiM-FoPOIGs6GxF2BRgk1MsSavGu8/edit" target="_blank" rel="noreferrer">📋 Google Sheets: ADK Adoption Burn Down</a>
        </div>
      </div>
    </div>
  );
}
