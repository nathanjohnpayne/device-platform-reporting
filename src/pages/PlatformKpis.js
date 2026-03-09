// pages/PlatformKpis.js
import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import UploadZone from '../components/UploadZone';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const PLATFORMS = ['PlayStation', 'Xbox', 'ADK'];
const COLORS    = { PlayStation: '#3b82f6', Xbox: '#10b981', ADK: '#f59e0b' };

function moM(curr, prev) {
  if (!prev || prev === 0) return null;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  return pct.toFixed(2) + '%';
}

function parseLookerRows(rows) {
  // Looker exports vary in column names; we try to normalize
  return rows.map(r => ({
    month:         r['Month'] || r['month'] || r['Date'] || '',
    platform:      r['Device Platform'] || r['platform'] || r['Platform'] || '',
    activeAccounts: parseFloat(r['Total Active Accounts'] || r['active_accounts'] || r['Active Accounts'] || 0),
    activeDevices:  parseFloat(r['Total Active Devices']  || r['active_devices']  || r['Active Devices']  || 0),
    playbackHours:  parseFloat(r['Total Playback Hours']  || r['playback_hours']  || r['Playback Hours']  || 0),
  }));
}

export default function PlatformKpis() {
  const [mauData,  setMauData]  = useState(null);
  const [madData,  setMadData]  = useState(null);
  const [hrsData,  setHrsData]  = useState(null);
  const [kpis,     setKpis]     = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [copied,   setCopied]   = useState(false);

  const process = (mau, mad, hrs) => {
    if (!mau) return;
    const parsed = parseLookerRows(mau);
    // Group by platform, latest month
    const byPlatform = {};
    parsed.forEach(r => {
      if (!byPlatform[r.platform]) byPlatform[r.platform] = [];
      byPlatform[r.platform].push(r);
    });
    setKpis(byPlatform);
  };

  const onMauParsed = (rows) => { setMauData(rows); setSaved(false); process(rows, madData, hrsData); };
  const onMadParsed = (rows) => { setMadData(rows); setSaved(false); process(mauData, rows, hrsData); };
  const onHrsParsed = (rows) => { setHrsData(rows); setSaved(false); process(mauData, madData, rows); };

  const generateConfluence = () => {
    if (!kpis) return '';
    const lines = Object.entries(kpis).map(([platform, rows]) => {
      const latest = rows[rows.length - 1];
      const prev   = rows[rows.length - 2];
      const mauMom = prev ? moM(latest.activeAccounts, prev.activeAccounts) : 'N/A';
      return `${platform}: MAU ${latest.activeAccounts.toLocaleString()} (${mauMom} MoM) | MAD ${latest.activeDevices.toLocaleString()} | Playback Hrs ${latest.playbackHours.toLocaleString()}`;
    }).join('\n');
    const date = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return `<h3>Business KPIs / Program KPIs (D+) — ${date}</h3>\n${lines}`;
  };

  const save = async () => {
    setSaving(true);
    try {
      await addDoc(collection(db, 'monthlySnapshots'), {
        type: 'platformKpis', month: new Date().toISOString().slice(0, 7),
        mauData, madData, hrsData, uploadedAt: serverTimestamp(),
      });
      setSaved(true);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(generateConfluence());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const chartData = kpis
    ? Object.entries(kpis).flatMap(([platform, rows]) =>
        rows.map(r => ({ month: r.month, [platform]: r.activeAccounts }))
      ).reduce((acc, r) => {
        const existing = acc.find(x => x.month === r.month);
        if (existing) Object.assign(existing, r);
        else acc.push(r);
        return acc;
      }, [])
    : [];

  return (
    <div>
      <div className="section-header">
        <span className="section-badge badge-monthly">Monthly</span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>Platform KPIs</h2>
      </div>

      <div className="instructions">
        <h4>ℹ️ How to get this data</h4>
        <ol>
          <li>Open the <a href="https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust" target="_blank" rel="noreferrer">D+ Device Health & Status Dashboard V2.0</a>.</li>
          <li>Set <strong>Date Granularity</strong> = Monthly, <strong>Date Range</strong> = last 1 complete month, <strong>Device Family</strong> = rust.</li>
          <li>Click <strong>Download (CSV)</strong> from the top-right menu. Open the zip and extract the files.</li>
          <li>Upload each CSV below (active accounts, active devices, playback hours).</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <a className="source-link" href="https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust" target="_blank" rel="noreferrer">🔗 Open Looker Dashboard</a>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Active Accounts CSV</div>
          <UploadZone label="active_accounts.csv" onParsed={onMauParsed} />
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Active Devices CSV</div>
          <UploadZone label="active_devices.csv" onParsed={onMadParsed} />
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Playback Hours CSV</div>
          <UploadZone label="playback_hours.csv" onParsed={onHrsParsed} />
        </div>
      </div>

      {kpis && (
        <>
          <div className="alert alert-success">✅ Platform KPIs loaded. Review below, then save and copy to Confluence.</div>

          <div className="card">
            <div className="card-title">📈 NCP+ADK Monthly Active Users</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => (v/1e6).toFixed(1)+'M'} tick={{ fontSize: 10 }} />
                <Tooltip formatter={v => v.toLocaleString()} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {PLATFORMS.map(p => <Line key={p} type="monotone" dataKey={p} stroke={COLORS[p]} strokeWidth={2} dot={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-title">📊 KPI Summary Table</div>
            <table className="data-table">
              <thead>
                <tr><th>Platform</th><th>MAU</th><th>MoM</th><th>MAD</th><th>MoM</th><th>Playback Hrs</th><th>MoM</th></tr>
              </thead>
              <tbody>
                {Object.entries(kpis).map(([platform, rows]) => {
                  const curr = rows[rows.length - 1];
                  const prev = rows[rows.length - 2];
                  const mauMom = prev ? moM(curr.activeAccounts, prev.activeAccounts) : null;
                  const madMom = prev ? moM(curr.activeDevices, prev.activeDevices) : null;
                  const hrsMom = prev ? moM(curr.playbackHours, prev.playbackHours) : null;
                  const cls = v => v && v.startsWith('-') ? 'neg' : 'pos';
                  return (
                    <tr key={platform}>
                      <td style={{ fontWeight: 700 }}>{platform}</td>
                      <td className="num">{curr.activeAccounts.toLocaleString()}</td>
                      <td className={cls(mauMom)}>{mauMom || '—'}</td>
                      <td className="num">{curr.activeDevices.toLocaleString()}</td>
                      <td className={cls(madMom)}>{madMom || '—'}</td>
                      <td className="num">{curr.playbackHours.toLocaleString()}</td>
                      <td className={cls(hrsMom)}>{hrsMom || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-title">🚀 Confluence Output</div>
            <div className="output-preview">{generateConfluence()}</div>
            <div className="output-actions">
              <button className="btn btn-primary" onClick={copy}>{copied ? '✅ Copied!' : '📋 Copy to Clipboard'}</button>
              <button className="btn btn-secondary" onClick={save} disabled={saving || saved}>
                {saved ? '✅ Saved' : saving ? <><span className="spinner" /> Saving…</> : '💾 Save to History'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
