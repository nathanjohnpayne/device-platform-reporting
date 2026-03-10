import React, { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AutoSaveStatus from '../components/AutoSaveStatus';
import UploadZone from '../components/UploadZone';
import { db } from '../firebase';
import useAutoImport from '../hooks/useAutoImport';
import { buildLegacyPlatformSnapshot } from '../utils/legacyWorkbooks';
import { buildMonthlyDataset, buildSummaryRows, buildTrendData, mergeMonthlySeries, parseLookerMetricRows, parseLookerZip } from '../utils/looker';
import { compactNumber, formatChange, getChangeClass, parseNumber } from '../utils/reporting';

const PLATFORM_ORDER = ['PlayStation', 'Xbox', 'ADK'];
const COLORS = { PlayStation: '#3b82f6', Xbox: '#10b981', ADK: '#f59e0b' };
const CHART_METRICS = [
  { key: 'mau', label: 'MAU', formatter: (value) => compactNumber(value, 1) },
  { key: 'mad', label: 'MAD', formatter: (value) => compactNumber(value, 1) },
  { key: 'hrs', label: 'Playback Hrs', formatter: (value) => compactNumber(value, 1) },
  { key: 'hpv', label: 'HPV', formatter: (value) => formatHpv(value) },
];

function sortPlatformRows(rows) {
  return [...rows].sort((left, right) => PLATFORM_ORDER.indexOf(left.entity) - PLATFORM_ORDER.indexOf(right.entity));
}

function formatHpv(value) {
  const numeric = parseNumber(value);
  return numeric == null ? '—' : numeric.toFixed(2);
}

function validatePlatformUpload(rows, metricType) {
  if (!rows?.length) {
    throw new Error('The upload is empty.');
  }

  if (!parseLookerMetricRows(rows, metricType, 'platform').length) {
    throw new Error('Unable to find valid monthly platform rows in this Looker export.');
  }
}

export default function PlatformKpis() {
  const [uploads, setUploads] = useState({ mau: null, mad: null, hrs: null });
  const [chartMetric, setChartMetric] = useState('mau');
  const [copied, setCopied] = useState(false);
  const [uploadSources, setUploadSources] = useState({});
  const [importGeneration, setImportGeneration] = useState(0);
  const [savedSeriesByPlatform, setSavedSeriesByPlatform] = useState({});

  const loadSavedHistory = () => (
    getDocs(query(collection(db, 'monthlySnapshots'), orderBy('uploadedAt', 'asc')))
      .then((snap) => {
        const savedSeries = snap.docs
          .map((docSnap) => docSnap.data())
          .filter((entry) => entry.type === 'platformKpis' && entry.seriesByPlatform)
          .map((entry) => entry.seriesByPlatform);

        setSavedSeriesByPlatform(mergeMonthlySeries(...savedSeries));
      })
      .catch(console.error)
  );

  useEffect(() => {
    loadSavedHistory();
  }, []);

  const metricRows = {
    mau: parseLookerMetricRows(uploads.mau || [], 'mau', 'platform'),
    mad: parseLookerMetricRows(uploads.mad || [], 'mad', 'platform'),
    hrs: parseLookerMetricRows(uploads.hrs || [], 'hrs', 'platform'),
  };

  const currentSeriesByPlatform = buildMonthlyDataset(metricRows, PLATFORM_ORDER);
  const hasCurrentSeries = Object.keys(currentSeriesByPlatform).length > 0;
  const seriesByPlatform = hasCurrentSeries
    ? mergeMonthlySeries(savedSeriesByPlatform, currentSeriesByPlatform)
    : currentSeriesByPlatform;
  const currentSummaryRows = sortPlatformRows(
    buildSummaryRows(currentSeriesByPlatform).filter((row) => row.current.mau != null || row.current.mad != null || row.current.hrs != null)
  );
  const summaryRows = sortPlatformRows(
    buildSummaryRows(seriesByPlatform).filter((row) => row.current.mau != null || row.current.mad != null || row.current.hrs != null)
  );
  const trendData = buildTrendData(seriesByPlatform, chartMetric);
  const legacyPlatformSnapshot = buildLegacyPlatformSnapshot(uploads);
  const ready = Boolean(uploads.mau && uploads.mad && uploads.hrs && currentSummaryRows.length);
  const month = currentSummaryRows[0]?.month || new Date().toISOString().slice(0, 7);
  const sourceFiles = Object.values(uploadSources).filter(Boolean);
  const autoSaveRequest = ready && importGeneration
    ? {
        type: 'platformKpis',
        label: 'Platform KPIs',
        collectionName: 'monthlySnapshots',
        data: {
          type: 'platformKpis',
          month,
          rowCounts: {
            mau: uploads.mau?.length || 0,
            mad: uploads.mad?.length || 0,
            hrs: uploads.hrs?.length || 0,
          },
          seriesByPlatform: currentSeriesByPlatform,
          summaryRows: currentSummaryRows,
          legacyWorkbook: legacyPlatformSnapshot ? { platform: legacyPlatformSnapshot } : null,
        },
        fingerprintData: {
          seriesByPlatform: currentSeriesByPlatform,
          summaryRows: currentSummaryRows,
        },
        sourceFiles,
        summary: {
          month,
          rowCount: sourceFiles.length,
        },
      }
    : null;
  const autoSave = useAutoImport(autoSaveRequest, autoSaveRequest ? `platform-kpis-${importGeneration}` : null, {
    onSaved: loadSavedHistory,
    onRolledBack: loadSavedHistory,
  });

  const setMetricUpload = (metricType) => (rows, fields, sourceFileName) => {
    validatePlatformUpload(rows, metricType);
    setUploads((prev) => ({ ...prev, [metricType]: rows }));
    setUploadSources((prev) => ({ ...prev, [metricType]: sourceFileName || prev[metricType] }));
    setImportGeneration((current) => current + 1);
  };

  const handleZipUpload = async (file) => {
    const files = await parseLookerZip(file);
    const nextUploads = {};

    files.forEach((entry) => {
      if (entry.metricType) {
        validatePlatformUpload(entry.rows, entry.metricType);
        nextUploads[entry.metricType] = entry.rows;
      }
    });

    if (!nextUploads.mau || !nextUploads.mad || !nextUploads.hrs) {
      throw new Error('Zip did not include recognizable active accounts, active devices, and playback hours CSVs.');
    }

    setUploads((prev) => ({ ...prev, ...nextUploads }));
    setUploadSources(
      files.reduce((acc, entry) => {
        if (entry.metricType) acc[entry.metricType] = entry.name;
        return acc;
      }, {})
    );
    setImportGeneration((current) => current + 1);
    return {
      status: 'ok',
      message: `Loaded ${files.length} CSVs from ${file.name}`,
    };
  };

  const generateConfluence = () => {
    if (!summaryRows.length) return '';
    const currentMonth = summaryRows[0]?.month || '';
    const rows = summaryRows.map((row) => (
      `${row.entity}: MAU ${compactNumber(row.current.mau, 2)} (${formatChange(row.mauMoM)}) | MAD ${compactNumber(row.current.mad, 2)} (${formatChange(row.madMoM)}) | Playback Hrs ${compactNumber(row.current.hrs, 2)} (${formatChange(row.hrsMoM)}) | HPV ${formatHpv(row.current.hpv)} (${formatChange(row.hpvMoM)})`
    )).join('\n');
    return `<h3>Business KPIs / Program KPIs (D+) — ${currentMonth}</h3>\n${rows}`;
  };

  const copy = () => {
    navigator.clipboard.writeText(generateConfluence());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          <li>Download the Looker zip. Upload the zip directly below, or manually upload the three extracted CSVs if the file names are unusual.</li>
          <li>If the export contains only the latest month, the app compares it against the most recent saved platform snapshot.</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <a className="source-link" href="https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust" target="_blank" rel="noreferrer">🔗 Open Looker Dashboard</a>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Upload Looker Zip</div>
        <div className="card-subtitle">Preferred path. The app will detect active accounts, active devices, and playback hours CSVs automatically.</div>
        <UploadZone label="Drop Looker ZIP here" hint="Upload the zipped Looker export" accept=".zip" onFileSelected={handleZipUpload} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Active Accounts CSV</div>
            {uploads.mau ? <span className="chip chip-green">Loaded</span> : <span className="chip chip-gray">Pending</span>}
          </div>
          <UploadZone label="active_accounts.csv" onParsed={setMetricUpload('mau')} />
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Active Devices CSV</div>
            {uploads.mad ? <span className="chip chip-green">Loaded</span> : <span className="chip chip-gray">Pending</span>}
          </div>
          <UploadZone label="active_devices.csv" onParsed={setMetricUpload('mad')} />
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Playback Hours CSV</div>
            {uploads.hrs ? <span className="chip chip-green">Loaded</span> : <span className="chip chip-gray">Pending</span>}
          </div>
          <UploadZone label="playback_hours.csv" onParsed={setMetricUpload('hrs')} />
        </div>
      </div>

      {summaryRows.length > 0 && (
        <>
          <div className="alert alert-success">
            ✅ Platform KPIs loaded for {summaryRows[0]?.month}. MAU, MAD, Playback Hours, and HPV are merged across the three Looker exports.
          </div>

          <AutoSaveStatus
            label="Platform KPIs"
            status={autoSave.status}
            error={autoSave.error}
            importedAtMs={autoSave.importedAtMs}
            rollbackUntilMs={autoSave.rollbackUntilMs}
            onRollback={autoSave.rollback}
          />

          <div className="card">
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div>
                <div className="card-title">📈 Trend Chart</div>
                <div className="card-subtitle">Switch between MAU, MAD, Playback Hours, and HPV</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CHART_METRICS.map((metric) => (
                  <button
                    key={metric.key}
                    className={`btn ${chartMetric === metric.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    onClick={() => setChartMetric(metric.key)}
                  >
                    {metric.label}
                  </button>
                ))}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={CHART_METRICS.find((metric) => metric.key === chartMetric)?.formatter} />
                <Tooltip formatter={CHART_METRICS.find((metric) => metric.key === chartMetric)?.formatter} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {PLATFORM_ORDER.filter((platform) => summaryRows.some((row) => row.entity === platform)).map((platform) => (
                  <Line key={platform} type="monotone" dataKey={platform} stroke={COLORS[platform]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-title">📊 KPI Summary Table</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>MAU</th>
                  <th>MoM</th>
                  <th>MAD</th>
                  <th>MoM</th>
                  <th>Playback Hrs</th>
                  <th>MoM</th>
                  <th>HPV</th>
                  <th>MoM</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row) => (
                  <tr key={row.entity}>
                    <td style={{ fontWeight: 700 }}>{row.entity}</td>
                    <td className="num">{row.current.mau?.toLocaleString() || '—'}</td>
                    <td className={getChangeClass(row.mauMoM)}>{formatChange(row.mauMoM)}</td>
                    <td className="num">{row.current.mad?.toLocaleString() || '—'}</td>
                    <td className={getChangeClass(row.madMoM)}>{formatChange(row.madMoM)}</td>
                    <td className="num">{row.current.hrs?.toLocaleString() || '—'}</td>
                    <td className={getChangeClass(row.hrsMoM)}>{formatChange(row.hrsMoM)}</td>
                    <td className="num">{formatHpv(row.current.hpv)}</td>
                    <td className={getChangeClass(row.hpvMoM)}>{formatChange(row.hpvMoM)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-title">🚀 Confluence Output</div>
            <div className="card-subtitle">Paste into the Business KPIs / Program KPIs (D+) section.</div>
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
