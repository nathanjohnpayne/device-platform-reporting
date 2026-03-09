import React, { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import UploadZone from '../components/UploadZone';
import { db } from '../firebase';
import { getFieldValue, parseNumber } from '../utils/reporting';

function deriveCurrentGa(versions) {
  const explicit = versions.find((version) => /current|ga/i.test(version.notes || ''));
  if (explicit?.adkVersion) return explicit.adkVersion;

  const dated = [...versions].sort((left, right) => String(right.releaseDate || '').localeCompare(String(left.releaseDate || '')));
  return dated[0]?.adkVersion || 'Unknown';
}

function buildPartnerSummary(rows, adkMap, currentGa, minDevices) {
  if (!rows?.length) return [];

  const partnerMap = {};
  rows.forEach((row) => {
    const partner = getFieldValue(row, ['partner', 'Partner']) || 'Unknown';
    const coreVersion = getFieldValue(row, ['core_version', 'core version']);
    const adkVersion = adkMap[coreVersion] || coreVersion || 'Unknown';
    const count = parseNumber(getFieldValue(row, ['count_unique_device_id', 'unique_devices', 'Unique Devices'])) || 0;

    if (!partnerMap[partner]) partnerMap[partner] = {};
    partnerMap[partner][adkVersion] = (partnerMap[partner][adkVersion] || 0) + count;
  });

  return Object.entries(partnerMap)
    .map(([partner, versions]) => {
      const total = Object.values(versions).reduce((sum, value) => sum + value, 0);
      if (total < minDevices) return null;
      const legacyEntries = Object.entries(versions).filter(([version]) => version !== currentGa);
      const legacyCount = legacyEntries.reduce((sum, [, value]) => sum + value, 0);
      const legacyPct = total ? (legacyCount / total) * 100 : 0;
      return {
        partner,
        versions,
        total,
        legacyCount,
        legacyPct,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.legacyPct - left.legacyPct);
}

export default function PartnerMigration() {
  const [data, setData] = useState(null);
  const [adkMap, setAdkMap] = useState({});
  const [currentGa, setCurrentGa] = useState('Unknown');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState({
    minDevices: 100,
    legacyAlertPct: 0,
  });

  useEffect(() => {
    getDocs(collection(db, 'adkVersions'))
      .then((snap) => {
        const versions = snap.docs.map((docSnap) => docSnap.data());
        const map = {};
        versions.forEach((version) => {
          (version.coreVersions || [version.coreVersion]).forEach((coreVersion) => {
            if (coreVersion) map[coreVersion] = version.adkVersion;
          });
        });
        setAdkMap(map);
        setCurrentGa(deriveCurrentGa(versions));
      })
      .catch(console.error);
  }, []);

  const partners = buildPartnerSummary(data, adkMap, currentGa, config.minDevices);
  const legacyPartners = partners.filter((partner) => partner.legacyPct > config.legacyAlertPct);
  const allVersions = [...new Set(partners.flatMap((partner) => Object.keys(partner.versions)))];

  const onParsed = (rows) => {
    setSaved(false);
    setData(rows);
  };

  const generateNotes = () => {
    if (!partners.length) return '';
    if (!legacyPartners.length) return `All partners with ${config.minDevices}+ devices are fully migrated to ${currentGa}.`;
    return legacyPartners
      .map((partner) => `${partner.partner}: ${partner.legacyPct.toFixed(1)}% on legacy ADK (${partner.legacyCount.toLocaleString()} of ${partner.total.toLocaleString()} devices)`)
      .join('\n');
  };

  const copy = () => {
    navigator.clipboard.writeText(generateNotes());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    if (!partners.length) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'partnerMigration'), {
        weekOf: new Date().toISOString().slice(0, 10),
        currentGa,
        thresholds: config,
        partners,
        uploadedAt: serverTimestamp(),
      });
      setSaved(true);
    } catch (e) {
      console.error(e);
    }
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
          <li>Upload below. The app maps <code>core_version</code> values using ADK Version Manager and flags any partner above the configured legacy threshold.</li>
          <li>Any unmapped <code>core_version</code> values are treated as legacy until the ADK version table is updated.</li>
        </ol>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="source-link" href="https://disney.my.sentry.io/organizations/disney/explore/discover/results/?field=partner&field=device&field=core_version&field=count_unique%28device_id%29&field=count%28%29&sort=-count_unique_device_id&statsPeriod=24h" target="_blank" rel="noreferrer">🔗 Open Sentry Dashboard</a>
          <a className="source-link" href="/adk-versions">⚙️ Manage ADK Versions</a>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Analysis Settings</div>
        <div className="card-subtitle">The current GA is derived from the ADK version marked current in Firestore. Adjust the thresholds if the weekly notes should be stricter.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Current GA</label>
            <input className="form-input" value={currentGa} readOnly />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Minimum devices</label>
            <input className="form-input" type="number" min="1" value={config.minDevices} onChange={(e) => setConfig((prev) => ({ ...prev, minDevices: Number(e.target.value) || 0 }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Legacy alert threshold %</label>
            <input className="form-input" type="number" min="0" step="0.1" value={config.legacyAlertPct} onChange={(e) => setConfig((prev) => ({ ...prev, legacyAlertPct: Number(e.target.value) || 0 }))} />
          </div>
        </div>
      </div>

      <div className="alert alert-info">
        ℹ️ Current GA: <strong>{currentGa}</strong>. Partners are included once they reach {config.minDevices}+ unique devices and are flagged when legacy share exceeds {config.legacyAlertPct}%. Unmapped versions count as legacy.
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
              <div className="text-muted">{config.minDevices}+ unique devices</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-label">Above Legacy Threshold</div>
              <div className="kpi-value" style={{ color: legacyPartners.length ? '#dc2626' : '#059669' }}>{legacyPartners.length}</div>
              <div className="text-muted">{config.legacyAlertPct}%+ on legacy ADK</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-label">Fully on {currentGa}</div>
              <div className="kpi-value" style={{ color: '#059669' }}>{partners.length - legacyPartners.length}</div>
              <div className="text-muted">partners fully migrated</div>
            </div>
          </div>

          {legacyPartners.length > 0 && (
            <div className="alert alert-warning">
              ⚠️ <strong>{legacyPartners.length} partner{legacyPartners.length > 1 ? 's' : ''}</strong> still exceed the configured legacy threshold.
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
                    {allVersions.map((version) => <th key={version}>{version}</th>)}
                    <th>Legacy %</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => {
                    const isLegacy = partner.legacyPct > config.legacyAlertPct;
                    return (
                      <tr key={partner.partner}>
                        <td style={{ fontWeight: 600 }}>{partner.partner}</td>
                        <td className="num">{partner.total.toLocaleString()}</td>
                        {allVersions.map((version) => <td key={version} className="num">{(partner.versions[version] || 0).toLocaleString()}</td>)}
                        <td className={isLegacy ? 'neg' : 'pos'}>{partner.legacyPct.toFixed(1)}%</td>
                        <td>{isLegacy ? <span className="chip chip-red">Legacy</span> : <span className="chip chip-green">Migrated</span>}</td>
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
