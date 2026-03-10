import React, { useEffect, useState } from 'react';
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import AutoSaveStatus from '../components/AutoSaveStatus';
import UploadZone from '../components/UploadZone';
import { db } from '../firebase';
import useAutoImport from '../hooks/useAutoImport';
import { buildAdkVersionMap, resolveAdkVersionLabel } from '../utils/adk';
import {
  compactNumber,
  compareDateValues,
  formatDateLabel,
  formatPercent,
  getFieldValue,
  guessDateKey,
  normalizeDateValue,
  parseNumber,
  safePercent,
} from '../utils/reporting';

const COLORS = ['#1e3a8a', '#7c3aed', '#f59e0b', '#10b981', '#ec4899', '#14b8a6'];

function buildVersionShare(rows, adkMap) {
  if (!rows?.length) {
    return { latestLabel: '', pieData: [], trendData: [], uploadLabels: [] };
  }

  const dateKey = guessDateKey(rows[0]);
  const grouped = {};

  rows.forEach((row, index) => {
    const rawDate = dateKey ? row[dateKey] : '';
    const normalizedDate = normalizeDateValue(rawDate) || `snapshot-${String(index + 1).padStart(2, '0')}`;
    const coreVersion = getFieldValue(row, ['core_version', 'core version', 'ADK Version', 'adk_version']);
    const label = resolveAdkVersionLabel(coreVersion, adkMap);
    const count = parseNumber(getFieldValue(row, ['count_unique_device_id', 'Unique Devices', 'unique_devices', 'devices', 'Unique Devices With Attempts']));

    if (count == null) return;
    if (!grouped[normalizedDate]) {
      grouped[normalizedDate] = {
        date: normalizedDate,
        label: rawDate ? formatDateLabel(rawDate) : `Point ${index + 1}`,
        total: 0,
      };
    }

    grouped[normalizedDate][label] = (grouped[normalizedDate][label] || 0) + count;
    grouped[normalizedDate].total += count;
  });

  const trendData = Object.values(grouped).sort((left, right) => compareDateValues(left.date, right.date));
  const uploadLabels = [...new Set(trendData.flatMap((row) => Object.keys(row).filter((key) => !['date', 'label', 'total'].includes(key))))];
  const latest = trendData[trendData.length - 1] || { total: 0 };
  const latestLabel = latest.label || '';

  const pieData = uploadLabels
    .map((name) => {
      const value = latest[name] || 0;
      const pctValue = safePercent(value, latest.total);
      return {
        name,
        value,
        pctValue: pctValue == null ? 0 : pctValue,
        pct: pctValue == null ? '0%' : formatPercent(pctValue, 1),
      };
    })
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value);

  return { latestLabel, pieData, trendData, uploadLabels };
}

function validateVersionShareRows(rows) {
  if (!rows?.length) {
    throw new Error('The upload is empty.');
  }

  const dateKey = guessDateKey(rows[0]);
  if (!dateKey) {
    throw new Error('Unable to find a date column in this ADK Version Share export.');
  }

  const hasVersion = rows.some((row) => String(getFieldValue(row, ['core_version', 'core version', 'ADK Version', 'adk_version']) || '').trim());
  if (!hasVersion) {
    throw new Error('The upload is missing a readable core_version or ADK version column.');
  }

  const hasDeviceCounts = rows.some((row) => parseNumber(getFieldValue(row, ['count_unique_device_id', 'Unique Devices', 'unique_devices', 'devices', 'Unique Devices With Attempts'])) != null);
  if (!hasDeviceCounts) {
    throw new Error('The upload is missing readable unique-device counts.');
  }
}

export default function AdkVersionShare() {
  const [data, setData] = useState(null);
  const [adkMap, setAdkMap] = useState({});
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);
  const [mappingsLoaded, setMappingsLoaded] = useState(false);
  const [importGeneration, setImportGeneration] = useState(0);
  const [sourceFiles, setSourceFiles] = useState([]);

  const loadHistory = () => (
    getDocs(query(collection(db, 'adkVersionShare'), orderBy('weekOf', 'desc'), limit(52)))
      .then((snap) => {
        setHistory(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })).reverse());
      })
      .catch(console.error)
  );

  useEffect(() => {
    getDocs(collection(db, 'adkVersions'))
      .then((snap) => {
        setAdkMap(buildAdkVersionMap(snap.docs.map((docSnap) => docSnap.data())));
        setMappingsLoaded(true);
      })
      .catch((error) => {
        setMappingsLoaded(true);
        console.error(error);
      });

    loadHistory();
  }, []);

  const analysis = buildVersionShare(data, adkMap);
  const weekOf = new Date().toISOString().slice(0, 10);
  const autoSaveRequest = analysis.pieData.length && mappingsLoaded && importGeneration
    ? {
        type: 'adkVersionShare',
        label: 'ADK Version Share',
        collectionName: 'adkVersionShare',
        data: {
          weekOf,
          latestLabel: analysis.latestLabel,
          shares: analysis.pieData,
          trendData: analysis.trendData,
        },
        fingerprintData: {
          latestLabel: analysis.latestLabel,
          shares: analysis.pieData,
          trendData: analysis.trendData,
        },
        sourceFiles,
        summary: {
          weekOf,
          rowCount: data?.length || 0,
          versionCount: analysis.pieData.length,
        },
      }
    : null;
  const autoSave = useAutoImport(autoSaveRequest, autoSaveRequest ? `adk-version-share-${importGeneration}` : null, {
    onSaved: loadHistory,
    onRolledBack: loadHistory,
  });

  const onParsed = (rows, sourceFileName = '') => {
    validateVersionShareRows(rows);
    setData(rows);
    setSourceFiles(sourceFileName ? [sourceFileName] : []);
    setImportGeneration((current) => current + 1);
  };

  const generateConfluence = () => {
    if (!analysis.pieData.length) return '';
    const lines = analysis.pieData
      .map((item) => `<li>${item.name}: <strong>${item.pct}</strong> (${item.value.toLocaleString()} unique devices)</li>`)
      .join('');

    return `<h3>ADK Version Share</h3>
<p>Latest Conviva point: ${analysis.latestLabel}</p>
<ul>${lines}</ul>`;
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
          <li>Export the chart data as CSV and upload below. The app will map each <code>core_version</code> value to a configured ADK label.</li>
          <li>Use the pie chart for the latest snapshot and the line chart for the 30-day trend.</li>
        </ol>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="source-link" href="https://pulse.conviva.com/app/custom-dashboards/dashboard/28764?data-source=ei" target="_blank" rel="noreferrer">🔗 Open Conviva Dashboard</a>
          <a className="source-link" href="/adk-versions">⚙️ Manage ADK Versions</a>
        </div>
      </div>

      {Object.keys(adkMap).length === 0 && (
        <div className="alert alert-warning">
          ⚠️ No ADK version mappings found. Add mappings in <a href="/adk-versions" style={{ fontWeight: 600 }}>ADK Version Manager</a> so core_version strings resolve correctly.
        </div>
      )}

      <div className="card">
        <div className="card-title">Upload Conviva Export</div>
        <div className="card-subtitle">CSV export from "NCP+ADK: ADK Version Comparisons (D+)" — last 30 days</div>
        <UploadZone label="Drop Conviva ADK Version Share CSV here" onParsed={(rows, fields, sourceFileName) => onParsed(rows, sourceFileName)} />
      </div>

      {analysis.pieData.length > 0 && (
        <>
          <div className="alert alert-success">
            ✅ Version share calculated from {data.length} rows. Latest snapshot: {analysis.latestLabel}.
          </div>

          <AutoSaveStatus
            label="ADK Version Share"
            status={autoSave.status}
            error={autoSave.error}
            importedAtMs={autoSave.importedAtMs}
            rollbackUntilMs={autoSave.rollbackUntilMs}
            onRollback={autoSave.rollback}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-title">🥧 Latest ADK Version Share</div>
              <div className="card-subtitle">Latest point from the uploaded 30-day export</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={analysis.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, pct }) => `${name}: ${pct}`} labelLine={false}>
                    {analysis.pieData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => compactNumber(value, 1)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-title">📊 Version Breakdown</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ADK Version</th>
                    <th>Unique Devices</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.pieData.map((item, index) => (
                    <tr key={item.name}>
                      <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: COLORS[index % COLORS.length], marginRight: 6 }} />{item.name}</td>
                      <td className="num">{item.value.toLocaleString()}</td>
                      <td><strong>{item.pct}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-title">📈 Unique Devices With Attempts Trend</div>
            <div className="card-subtitle">30-day series from the uploaded Conviva export</div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={analysis.trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={18} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => compactNumber(value, 1)} />
                <Tooltip formatter={(value) => compactNumber(value, 1)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {analysis.uploadLabels.map((label, index) => (
                  <Line key={label} type="monotone" dataKey={label} name={label} stroke={COLORS[index % COLORS.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {history.length > 1 && (
            <div className="card">
              <div className="card-title">🗂️ Weekly Saved History</div>
              <div className="card-subtitle">Most recent saved weekly share snapshots</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={history.slice(-12)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="weekOf" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {[...new Set(history.flatMap((entry) => (entry.shares || []).map((share) => share.name)))].map((label, index) => (
                    <Line
                      key={label}
                      type="monotone"
                      dataKey={(entry) => {
                        const share = entry.shares?.find((item) => item.name === label);
                        return share?.pctValue ?? Number((share?.pct || '0').replace('%', ''));
                      }}
                      name={label}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
