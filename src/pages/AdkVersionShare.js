// pages/AdkVersionShare.js
import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import UploadZone from '../components/UploadZone';
import { db } from '../firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';

const COLORS = ['#1e3a8a', '#7c3aed', '#f59e0b', '#10b981', '#ec4899'];
const ADK_LABELS = ['ADK 3.0.1', 'ADK 3.1.0', 'ADK 3.1.1', 'ADK 4.0'];

function pct(v, total) { return total ? ((v / total) * 100).toFixed(1) + '%' : '0%'; }

export default function AdkVersionShare() {
  const [data, setData]         = useState(null);
  const [adkMap, setAdkMap]     = useState({});
  const [pieData, setPieData]   = useState([]);
  const [history, setHistory]   = useState([]);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [copied, setCopied]     = useState(false);

  // Load ADK version map from Firestore
  useEffect(() => {
    getDocs(collection(db, 'adkVersions')).then(snap => {
      const map = {};
      snap.forEach(d => {
        const v = d.data();
        // Map each core_version string to its ADK label
        (v.coreVersions || [v.coreVersion]).forEach(cv => { map[cv] = v.adkVersion; });
      });
      setAdkMap(map);
    }).catch(console.error);

    // Load history
    getDocs(query(collection(db, 'adkVersionShare'), orderBy('weekOf', 'desc'))).then(snap => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse());
    }).catch(console.error);
  }, []);

  const onParsed = (rows, fields) => {
    setSaved(false);
    setData(rows);

    // Group by core_version / ADK label
    const counts = {};
    let total = 0;
    rows.forEach(r => {
      const cv = r['core_version'] || r['ADK Version'] || '';
      const label = adkMap[cv] || cv || 'Unknown';
      const cnt = parseInt(r['count_unique_device_id'] || r['Unique Devices'] || r['devices'] || 0);
      counts[label] = (counts[label] || 0) + cnt;
      total += cnt;
    });

    setPieData(
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value, pct: pct(value, total) }))
    );
  };

  const saveToFirestore = async () => {
    if (!pieData.length) return;
    setSaving(true);
    try {
      const weekOf = new Date().toISOString().slice(0, 10);
      const entry = { weekOf, shares: pieData, uploadedAt: serverTimestamp() };
      await addDoc(collection(db, 'adkVersionShare'), entry);
      setHistory(prev => [...prev, entry]);
      setSaved(true);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const generateConfluence = () => {
    const lines = pieData.map(d => `${d.name}: ${d.pct} (${d.value.toLocaleString()} unique devices)`).join('\n');
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `<h3>ADK Version Share — Updated: ${date}</h3>\n${lines}\n\n<!-- Pie chart image: download from the app and attach here -->`;
  };

  const copy = () => {
    navigator.clipboard.writeText(generateConfluence());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="section-header">
        <span className="section-badge badge-weekly">Weekly</span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>ADK Version Share</h2>
      </div>

      <div className="instructions">
        <h4>ℹ️ How to get this data</h4>
        <ol>
          <li>Open the <a href="https://pulse.conviva.com/app/custom-dashboards/dashboard/28764?data-source=ei" target="_blank" rel="noreferrer">Conviva: NCP+ADK ADK Version Comparisons (D+)</a> dashboard.</li>
          <li>Set the date range to <strong>Last 30 days</strong>.</li>
          <li>Go to the <strong>Unique Devices With Attempts</strong> chart. Mouse over <strong>yesterday's</strong> data point and note the values per ADK version.</li>
          <li>Export the data as CSV.</li>
          <li>Upload below. The app maps <code>core_version</code> strings to ADK labels automatically using the <a href="/adk-versions">ADK Version Manager</a>.</li>
        </ol>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="source-link" href="https://pulse.conviva.com/app/custom-dashboards/dashboard/28764?data-source=ei" target="_blank" rel="noreferrer">🔗 Open Conviva Dashboard</a>
          <a className="source-link" href="/adk-versions">⚙️ Manage ADK Versions</a>
        </div>
      </div>

      {Object.keys(adkMap).length === 0 && (
        <div className="alert alert-warning">
          ⚠️ No ADK version mappings found. <a href="/adk-versions" style={{ fontWeight: 600 }}>Add mappings in ADK Version Manager</a> before uploading to ensure core_version strings are mapped correctly.
        </div>
      )}

      <div className="card">
        <div className="card-title">Upload Conviva Export</div>
        <div className="card-subtitle">CSV export from "NCP+ADK: ADK Version Comparisons (D+)" — last 30 days</div>
        <UploadZone label="Drop Conviva ADK Version Share CSV here" onParsed={onParsed} />
      </div>

      {pieData.length > 0 && (
        <>
          <div className="alert alert-success">✅ Version share calculated from {data.length} rows.</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-title">🥧 ADK Version Share</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, pct }) => `${name}: ${pct}`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => v.toLocaleString()} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-title">📊 Version Breakdown</div>
              <table className="data-table">
                <thead><tr><th>ADK Version</th><th>Unique Devices</th><th>Share</th></tr></thead>
                <tbody>
                  {pieData.map((d, i) => (
                    <tr key={i}>
                      <td><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:COLORS[i%COLORS.length], marginRight:6 }} />{d.name}</td>
                      <td className="num">{d.value.toLocaleString()}</td>
                      <td><strong>{d.pct}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {history.length > 1 && (
            <div className="card">
              <div className="card-title">📈 Historical Trend</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={history.slice(-12)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="weekOf" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {ADK_LABELS.map((lbl, i) => (
                    <Line key={lbl} type="monotone" dataKey={d => (d.shares?.find(s => s.name === lbl)?.pct || '0').replace('%', '')} name={lbl} stroke={COLORS[i]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card">
            <div className="card-title">🚀 Confluence Output</div>
            <div className="card-subtitle">Paste into the "ADK Version Share" section of the weekly Confluence page.</div>
            <div className="output-preview">{generateConfluence()}</div>
            <div className="output-actions">
              <button className="btn btn-primary" onClick={copy}>{copied ? '✅ Copied!' : '📋 Copy to Clipboard'}</button>
              <button className="btn btn-secondary" onClick={saveToFirestore} disabled={saving || saved}>
                {saved ? '✅ Saved to History' : saving ? <><span className="spinner" /> Saving…</> : '💾 Save to History'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
