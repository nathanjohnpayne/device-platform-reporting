// pages/RegionalKpis.js
import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import UploadZone from '../components/UploadZone';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const REGIONS = ['DOMESTIC', 'EMEA', 'LATAM', 'APAC'];
const COLORS  = { DOMESTIC: '#3b82f6', EMEA: '#f59e0b', LATAM: '#10b981', APAC: '#6366f1' };

function moM(curr, prev) {
  if (!prev || prev === 0) return null;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

export default function RegionalKpis() {
  const [regionData, setRegionData] = useState({});
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [copied, setCopied]         = useState(false);

  const onParsed = (region) => (rows) => {
    setSaved(false);
    const total = rows.reduce((sum, r) => {
      return {
        mau: sum.mau + parseFloat(r['Total Active Accounts'] || r['active_accounts'] || 0),
        mad: sum.mad + parseFloat(r['Total Active Devices']  || r['active_devices']  || 0),
        hrs: sum.hrs + parseFloat(r['Total Playback Hours']  || r['playback_hours']  || 0),
      };
    }, { mau: 0, mad: 0, hrs: 0 });
    setRegionData(prev => ({ ...prev, [region]: { ...total, rows } }));
  };

  const loaded = Object.keys(regionData);
  const allLoaded = REGIONS.every(r => loaded.includes(r));

  const grandTotal = loaded.reduce((acc, r) => ({
    mau: acc.mau + (regionData[r]?.mau || 0),
    mad: acc.mad + (regionData[r]?.mad || 0),
    hrs: acc.hrs + (regionData[r]?.hrs || 0),
  }), { mau: 0, mad: 0, hrs: 0 });

  const pieData = REGIONS.filter(r => regionData[r]).map(r => ({
    name: r, value: regionData[r].mau,
    pct: grandTotal.mau ? ((regionData[r].mau / grandTotal.mau) * 100).toFixed(1) + '%' : '0%',
  }));

  const generateConfluence = () => {
    const date = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const rows = REGIONS.filter(r => regionData[r]).map(r => {
      const d = regionData[r];
      return `${r}: MAU ${(d.mau/1e6).toFixed(2)}M | MAD ${(d.mad/1e6).toFixed(2)}M | Playback Hrs ${(d.hrs/1e6).toFixed(2)}M`;
    }).join('\n');
    return `<h3>Regional KPIs — ${date}</h3>\n${rows}\nTOTAL: MAU ${(grandTotal.mau/1e6).toFixed(2)}M | MAD ${(grandTotal.mad/1e6).toFixed(2)}M | Hrs ${(grandTotal.hrs/1e6).toFixed(2)}M`;
  };

  const copy = () => {
    navigator.clipboard.writeText(generateConfluence());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    setSaving(true);
    try {
      await addDoc(collection(db, 'monthlySnapshots'), {
        type: 'regionalKpis', month: new Date().toISOString().slice(0, 7),
        regions: regionData, uploadedAt: serverTimestamp(),
      });
      setSaved(true);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div>
      <div className="section-header">
        <span className="section-badge badge-monthly">Monthly</span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>Regional KPIs</h2>
      </div>

      <div className="instructions">
        <h4>ℹ️ How to get this data</h4>
        <ol>
          <li>Open the <a href="https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust" target="_blank" rel="noreferrer">D+ Device Health & Status Dashboard V2.0</a>.</li>
          <li>Set <strong>Device Family</strong> = rust, <strong>Date Range</strong> = last 1 complete month.</li>
          <li>For each region (APAC, DOMESTIC, EMEA, LATAM): set the Region filter → Download CSV → upload below.</li>
          <li>Repeat for all four regions. The KPI table and pie chart update automatically as you upload.</li>
        </ol>
        <a className="source-link" href="https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust" target="_blank" rel="noreferrer">🔗 Open Looker Dashboard</a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {REGIONS.map(region => (
          <div key={region} className="card" style={{ marginBottom: 0 }}>
            <div className="flex-between" style={{ marginBottom: 10 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>{region}</div>
              {regionData[region] ? <span className="chip chip-green">✅ Loaded</span> : <span className="chip chip-gray">Pending</span>}
            </div>
            <UploadZone label={`Drop ${region} CSV`} onParsed={onParsed(region)} />
            {regionData[region] && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#475569' }}>
                MAU: <strong>{(regionData[region].mau/1e6).toFixed(2)}M</strong> ·
                MAD: <strong>{(regionData[region].mad/1e6).toFixed(2)}M</strong> ·
                Hrs: <strong>{(regionData[region].hrs/1e6).toFixed(2)}M</strong>
              </div>
            )}
          </div>
        ))}
      </div>

      {loaded.length > 0 && (
        <>
          <div className="alert alert-info">
            {allLoaded ? '✅ All 4 regions loaded. Ready to generate output.' : `ℹ️ ${loaded.length}/4 regions loaded: ${loaded.join(', ')}`}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-title">🌍 MAU by Region</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={d => `${d.name}: ${d.pct}`} labelLine={false}>
                    {pieData.map((d, i) => <Cell key={i} fill={COLORS[d.name]} />)}
                  </Pie>
                  <Tooltip formatter={v => (v/1e6).toFixed(2)+'M'} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-title">📊 Regional KPI Table</div>
              <table className="data-table">
                <thead><tr><th>Region</th><th>MAU</th><th>MAD</th><th>Playback Hrs</th></tr></thead>
                <tbody>
                  {REGIONS.filter(r => regionData[r]).map(r => (
                    <tr key={r}>
                      <td style={{ fontWeight: 700 }}>{r}</td>
                      <td className="num">{(regionData[r].mau/1e6).toFixed(2)}M</td>
                      <td className="num">{(regionData[r].mad/1e6).toFixed(2)}M</td>
                      <td className="num">{(regionData[r].hrs/1e6).toFixed(2)}M</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td>TOTAL</td>
                    <td className="num">{(grandTotal.mau/1e6).toFixed(2)}M</td>
                    <td className="num">{(grandTotal.mad/1e6).toFixed(2)}M</td>
                    <td className="num">{(grandTotal.hrs/1e6).toFixed(2)}M</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {allLoaded && (
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
          )}
        </>
      )}
    </div>
  );
}
