// pages/PartnerMigration.js
import React, { useState, useEffect } from 'react';
import UploadZone from '../components/UploadZone';
import { db } from '../firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

const CURRENT_GA = 'ADK 3.1.1'; // Update when ADK 4.0 GA ships (23 Mar 2026)
const MIN_DEVICES = 100;

export default function PartnerMigration() {
  const [data, setData]         = useState(null);
  const [adkMap, setAdkMap]     = useState({});
  const [partners, setPartners] = useState([]);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    getDocs(collection(db, 'adkVersions')).then(snap => {
      const map = {};
      snap.forEach(d => {
        const v = d.data();
        (v.coreVersions || [v.coreVersion]).forEach(cv => { if (cv) map[cv] = v.adkVersion; });
      });
      setAdkMap(map);
    }).catch(console.error);
  }, []);

  const onParsed = (rows) => {
    setSaved(false);
    setData(rows);

    // Group by partner → ADK version
    const partnerMap = {};
    rows.forEach(r => {
      const partner = r['partner'] || r['Partner'] || 'Unknown';
      const cv      = r['core_version'] || r['core version'] || '';
      const adkVer  = adkMap[cv] || cv || 'Unknown';
      const cnt     = parseInt(r['count_unique_device_id'] || r['unique_devices'] || 0);
      if (!partnerMap[partner]) partnerMap[partner] = {};
      partnerMap[partner][adkVer] = (partnerMap[partner][adkVer] || 0) + cnt;
    });

    // Build summary rows, filter to >= MIN_DEVICES
    const summary = Object.entries(partnerMap)
      .map(([partner, versions]) => {
        const total = Object.values(versions).reduce((a, b) => a + b, 0);
        if (total < MIN_DEVICES) return null;
        const legacy = Object.entries(versions).filter(([v]) => v !== CURRENT_GA && v !== 'Unknown');
        const legacyCount = legacy.reduce((a, [, c]) => a + c, 0);
        return { partner, versions, total, legacyCount, legacyPct: total ? ((legacyCount / total) * 100).toFixed(1) : '0' };
      })
      .filter(Boolean)
      .sort((a, b) => b.legacyPct - a.legacyPct);

    setPartners(summary);
  };

  const legacy = partners.filter(p => parseFloat(p.legacyPct) > 0);

  const generateNotes = () => {
    if (!legacy.length) return 'All partners with 100+ devices are fully migrated to ' + CURRENT_GA + '.';
    return legacy.map(p =>
      `${p.partner}: ${p.legacyPct}% on legacy ADK (${p.legacyCount.toLocaleString()} of ${p.total.toLocaleString()} devices)`
    ).join('\n');
  };

  const copy = () => {
    navigator.clipboard.writeText(generateNotes());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    setSaving(true);
    try {
      await addDoc(collection(db, 'partnerMigration'), {
        weekOf: new Date().toISOString().slice(0, 10),
        partners,
        uploadedAt: serverTimestamp(),
      });
      setSaved(true);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div>
      <div className="section-header">
        <span className="section-badge badge-weekly">Weekly</span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>Partner Migration Status</h2>
      </div>

      <div className="instructions">
        <h4>ℹ️ How to get this data</h4>
        <ol>
          <li>Open <a href="https://disney.my.sentry.io/organizations/disney/explore/discover/results/?field=partner&field=device&field=core_version&field=count_unique%28device_id%29&field=count%28%29&sort=-count_unique_device_id&statsPeriod=24h" target="_blank" rel="noreferrer">Sentry: ADK Partner–Device Combinations</a>.</li>
          <li>Ensure the time range is set to <strong>Last 24 hours</strong> and the view is <strong>tabular</strong>.</li>
          <li>Click <strong>Export</strong> to download the CSV.</li>
          <li>Upload below. The app maps core_version → ADK label, filters to ≥{MIN_DEVICES} unique devices, and identifies partners still on legacy versions.</li>
        </ol>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="source-link" href="https://disney.my.sentry.io/organizations/disney/explore/discover/results/?field=partner&field=device&field=core_version&field=count_unique%28device_id%29&field=count%28%29&sort=-count_unique_device_id&statsPeriod=24h" target="_blank" rel="noreferrer">🔗 Open Sentry Dashboard</a>
          <a className="source-link" href="/adk-versions">⚙️ Manage ADK Versions</a>
        </div>
      </div>

      <div className="alert alert-info">
        ℹ️ Current GA version: <strong>{CURRENT_GA}</strong>. Partners with any devices on older versions are flagged. Filter threshold: ≥{MIN_DEVICES} unique devices.
      </div>

      <div className="card">
        <div className="card-title">Upload Sentry Export</div>
        <div className="card-subtitle">CSV from Sentry "ADK Partner–Device Combinations" — last 24 hours</div>
        <UploadZone
          label="Drop Sentry CSV here"
          expectedColumns={['partner', 'device', 'core_version', 'count_unique_device_id']}
          onParsed={onParsed}
        />
      </div>

      {partners.length > 0 && (
        <>
          <div className="kpi-grid kpi-grid-3" style={{ marginBottom: 20 }}>
            <div className="kpi-box">
              <div className="kpi-label">Total Partners</div>
              <div className="kpi-value">{partners.length}</div>
              <div className="text-muted">≥{MIN_DEVICES} unique devices</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-label">Not Fully Migrated</div>
              <div className="kpi-value" style={{ color: legacy.length ? '#dc2626' : '#059669' }}>{legacy.length}</div>
              <div className="text-muted">partners with legacy ADK</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-label">Fully on {CURRENT_GA}</div>
              <div className="kpi-value" style={{ color: '#059669' }}>{partners.length - legacy.length}</div>
              <div className="text-muted">partners fully migrated</div>
            </div>
          </div>

          {legacy.length > 0 && (
            <div className="alert alert-warning">
              ⚠️ <strong>{legacy.length} partner{legacy.length > 1 ? 's' : ''}</strong> still have devices on legacy ADK versions. See details below.
            </div>
          )}

          <div className="card">
            <div className="card-title">Partner Migration Table</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Total Devices</th>
                    {[...new Set(partners.flatMap(p => Object.keys(p.versions)))].map(v => <th key={v}>{v}</th>)}
                    <th>Legacy %</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p, i) => {
                    const allVersions = [...new Set(partners.flatMap(x => Object.keys(x.versions)))];
                    const isLegacy = parseFloat(p.legacyPct) > 0;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{p.partner}</td>
                        <td className="num">{p.total.toLocaleString()}</td>
                        {allVersions.map(v => <td key={v} className="num">{(p.versions[v] || 0).toLocaleString()}</td>)}
                        <td className={isLegacy ? 'neg' : 'pos'}>{p.legacyPct}%</td>
                        <td>
                          {isLegacy
                            ? <span className="chip chip-red">Legacy</span>
                            : <span className="chip chip-green">Migrated</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-title">📝 Confluence Notes</div>
            <div className="card-subtitle">Paste into the "Partners Not Fully Migrated" notes in the weekly report.</div>
            <div className="output-preview">{generateNotes()}</div>
            <div className="output-actions">
              <button className="btn btn-primary" onClick={copy}>{copied ? '✅ Copied!' : '📋 Copy Notes'}</button>
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
