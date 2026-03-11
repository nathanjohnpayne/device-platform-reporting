import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AutoSaveStatus from '../components/AutoSaveStatus';
import UploadZone from '../components/UploadZone';
import { db } from '../firebase';
import useAutoImport from '../hooks/useAutoImport';
import { formatImportTimestamp, timestampToMs } from '../utils/importHistory';
import { buildLegacyPlatformSnapshot } from '../utils/legacyWorkbooks';
import {
  buildMonthlyDataset,
  buildSummaryRows,
  buildTrendData,
  mergeMonthlySeries,
  parseLookerMetricRows,
  parseLookerZip,
} from '../utils/looker';
import {
  ESTIMATE_REGIONS,
  REGIONAL_ESTIMATE_DISCLAIMER,
} from '../utils/partnerRegionMapping';
import { buildRegionSummary, buildRegionalEstimate } from '../utils/regionalEstimates';
import {
  compactNumber,
  formatChange,
  formatDateLabel,
  getChangeClass,
  parseNumber,
  toPercentChange,
} from '../utils/reporting';

const PLATFORM_ORDER = ['PlayStation', 'Xbox', 'ADK'];
const PLATFORM_COLORS = { PlayStation: '#3b82f6', Xbox: '#10b981', ADK: '#f59e0b' };
const REGION_COLORS = { DOMESTIC: '#3b82f6', EMEA: '#f59e0b', LATAM: '#10b981', APAC: '#6366f1' };
const CHART_METRICS = [
  { key: 'mau', label: 'MAU', formatter: (value) => compactNumber(value, 1) },
  { key: 'mad', label: 'MAD', formatter: (value) => compactNumber(value, 1) },
  { key: 'hrs', label: 'Playback Hrs', formatter: (value) => compactNumber(value, 1) },
  { key: 'hpv', label: 'HPV', formatter: (value) => formatHpv(value) },
];

function createEmptyRegionalInputs() {
  return {
    activeAccountText: '',
    activeAccountFileName: '',
    playbackHoursText: '',
    playbackHoursFileName: '',
    regionalDeviceDistributionText: '',
    regionalDeviceDistributionFileName: '',
    averageDailyActiveDevicesText: '',
    averageDailyActiveDevicesFileName: '',
    zipFileName: '',
  };
}

function formatHpv(value) {
  const numeric = parseNumber(value);
  return numeric == null ? '—' : numeric.toFixed(2);
}

function sortPlatformRows(rows) {
  return [...rows].sort((left, right) => PLATFORM_ORDER.indexOf(left.entity) - PLATFORM_ORDER.indexOf(right.entity));
}

function validatePlatformUpload(rows, metricType) {
  if (!rows?.length) {
    throw new Error('The upload is empty.');
  }

  if (!parseLookerMetricRows(rows, metricType, 'platform').length) {
    throw new Error('Unable to find valid monthly platform rows in this Looker export.');
  }
}

function buildRegionalTotals(summaryRows = []) {
  return summaryRows.reduce((acc, row) => ({
    mau: acc.mau + (row.current?.mau || 0),
    mad: acc.mad + (row.current?.mad || 0),
    hrs: acc.hrs + (row.current?.hrs || 0),
  }), { mau: 0, mad: 0, hrs: 0 });
}

function buildRegionalPreviousTotals(summaryRows = []) {
  return summaryRows.reduce((acc, row) => ({
    mau: acc.mau + (row.previous?.mau || 0),
    mad: acc.mad + (row.previous?.mad || 0),
    hrs: acc.hrs + (row.previous?.hrs || 0),
  }), { mau: 0, mad: 0, hrs: 0 });
}

function statusLabel(loaded, filename) {
  if (!loaded) return 'Missing';
  return filename || 'Loaded';
}

function regionalSourceFiles(inputs) {
  return [
    inputs.activeAccountFileName,
    inputs.playbackHoursFileName,
    inputs.regionalDeviceDistributionFileName,
    inputs.averageDailyActiveDevicesFileName,
  ].filter(Boolean);
}

function lowerName(value = '') {
  return String(value || '').toLowerCase();
}

function pickNamedFile(files, names) {
  return names.map((name) => files.find((entry) => lowerName(entry.name) === name)).find(Boolean) || null;
}

function selectPlatformMetricFile(files, metricType, preferredName) {
  const exactMatch = files.find((entry) => lowerName(entry.name) === preferredName);
  if (exactMatch && parseLookerMetricRows(exactMatch.rows || [], metricType, 'platform').length) {
    return exactMatch;
  }

  return files.find((entry) => (
    entry.metricType === metricType
    && parseLookerMetricRows(entry.rows || [], metricType, 'platform').length
  )) || null;
}

function formatMixValue(value) {
  const numeric = parseNumber(value);
  if (numeric == null) return '—';
  return `${(numeric * 100).toFixed(1)}%`;
}

export default function PlatformKpis() {
  const [uploads, setUploads] = useState({ mau: null, mad: null, hrs: null });
  const [chartMetric, setChartMetric] = useState('mau');
  const [copied, setCopied] = useState(false);
  const [uploadSources, setUploadSources] = useState({});
  const [regionalInputs, setRegionalInputs] = useState(createEmptyRegionalInputs);
  const [importGeneration, setImportGeneration] = useState(0);
  const [savedSeriesByPlatform, setSavedSeriesByPlatform] = useState({});
  const [savedSeriesByRegion, setSavedSeriesByRegion] = useState({});
  const [historyLoading, setHistoryLoading] = useState(true);
  const [mappingLoading, setMappingLoading] = useState(true);
  const [mappingError, setMappingError] = useState('');
  const [partnerMappings, setPartnerMappings] = useState([]);
  const [mappingMeta, setMappingMeta] = useState(null);

  const loadSavedHistory = async () => {
    setHistoryLoading(true);

    try {
      const snap = await getDocs(query(collection(db, 'monthlySnapshots'), orderBy('uploadedAt', 'asc')));
      const monthlySnapshots = snap.docs.map((docSnap) => docSnap.data());
      const platformSeries = monthlySnapshots
        .filter((entry) => entry.type === 'platformKpis' && entry.seriesByPlatform)
        .map((entry) => entry.seriesByPlatform);
      const regionalSeries = monthlySnapshots
        .map((entry) => {
          if (entry.type === 'platformKpis' && entry.regionalEstimate?.seriesByRegion) return entry.regionalEstimate.seriesByRegion;
          if (entry.type === 'regionalKpis' && entry.seriesByRegion) return entry.seriesByRegion;
          return null;
        })
        .filter(Boolean);

      setSavedSeriesByPlatform(mergeMonthlySeries(...platformSeries));
      setSavedSeriesByRegion(mergeMonthlySeries(...regionalSeries));
    } catch (error) {
      console.error(error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadPartnerMappings = async () => {
    setMappingLoading(true);
    setMappingError('');

    try {
      const [rowsSnap, metaSnap] = await Promise.all([
        getDocs(collection(db, 'partnerRegionMappings')),
        getDoc(doc(db, 'partnerRegionMappingMeta', 'current')),
      ]);

      setPartnerMappings(rowsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      setMappingMeta(metaSnap.exists() ? metaSnap.data() : null);
    } catch (error) {
      console.error(error);
      setPartnerMappings([]);
      setMappingMeta(null);
      setMappingError(error.message || 'Unable to load the partner-region mapping.');
    } finally {
      setMappingLoading(false);
    }
  };

  useEffect(() => {
    loadSavedHistory();
    loadPartnerMappings();
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
  const month = currentSummaryRows[0]?.month || new Date().toISOString().slice(0, 7);
  const platformReady = Boolean(uploads.mau && uploads.mad && uploads.hrs && currentSummaryRows.length);
  const hasAllRegionalFiles = Boolean(
    regionalInputs.activeAccountText
    && regionalInputs.playbackHoursText
    && regionalInputs.regionalDeviceDistributionText
    && regionalInputs.averageDailyActiveDevicesText
  );
  const regionalEstimateResult = useMemo(() => {
    if (!hasAllRegionalFiles || !partnerMappings.length) {
      return { estimate: null, error: '' };
    }

    try {
      return {
        estimate: {
          ...buildRegionalEstimate({
            activeAccountText: regionalInputs.activeAccountText,
            playbackHoursText: regionalInputs.playbackHoursText,
            regionalDeviceDistributionText: regionalInputs.regionalDeviceDistributionText,
            averageDailyActiveDevicesText: regionalInputs.averageDailyActiveDevicesText,
            mappings: partnerMappings,
            mappingImportedAt: timestampToMs(mappingMeta?.importedAt),
            sourceFiles: regionalSourceFiles(regionalInputs),
          }),
          mappingSourceFileName: mappingMeta?.sourceFileName || '',
        },
        error: '',
      };
    } catch (error) {
      return {
        estimate: null,
        error: error.message || 'Unable to derive regional estimates from this Looker zip.',
      };
    }
  }, [hasAllRegionalFiles, mappingMeta?.importedAt, mappingMeta?.sourceFileName, partnerMappings, regionalInputs]);

  const currentRegionalEstimate = regionalEstimateResult.estimate;
  const regionalEstimateError = regionalEstimateResult.error;
  const regionalSeriesByRegion = currentRegionalEstimate
    ? mergeMonthlySeries(savedSeriesByRegion, currentRegionalEstimate.seriesByRegion)
    : {};
  const regionalSummaryRows = currentRegionalEstimate ? buildRegionSummary(regionalSeriesByRegion) : [];
  const regionalTotals = buildRegionalTotals(regionalSummaryRows);
  const previousRegionalTotals = buildRegionalPreviousTotals(regionalSummaryRows);
  const regionalTotalChanges = {
    mau: toPercentChange(regionalTotals.mau, previousRegionalTotals.mau),
    mad: toPercentChange(regionalTotals.mad, previousRegionalTotals.mad),
    hrs: toPercentChange(regionalTotals.hrs, previousRegionalTotals.hrs),
  };
  const regionalPieData = regionalSummaryRows.map((row) => ({
    name: row.region,
    value: row.current?.mau || 0,
    pct: regionalTotals.mau ? `${(((row.current?.mau || 0) / regionalTotals.mau) * 100).toFixed(1)}%` : '0%',
  }));
  const regionalFilesLoaded = regionalSourceFiles(regionalInputs);
  const sourceFiles = [
    ...Object.values(uploadSources).filter(Boolean),
    ...regionalFilesLoaded,
  ];
  const regionalWaitsForMappings = platformReady && hasAllRegionalFiles && mappingLoading;
  const workflowLabel = 'Platform & Regional KPIs';
  const autoSaveRequest = platformReady && importGeneration && !regionalWaitsForMappings
    ? {
        type: 'platformKpis',
        label: workflowLabel,
        collectionName: 'monthlySnapshots',
        data: {
          type: 'platformKpis',
          workflowLabel,
          month,
          rowCounts: {
            mau: uploads.mau?.length || 0,
            mad: uploads.mad?.length || 0,
            hrs: uploads.hrs?.length || 0,
          },
          seriesByPlatform: currentSeriesByPlatform,
          summaryRows: currentSummaryRows,
          legacyWorkbook: legacyPlatformSnapshot ? { platform: legacyPlatformSnapshot } : null,
          regionalEstimate: currentRegionalEstimate || null,
        },
        fingerprintData: {
          seriesByPlatform: currentSeriesByPlatform,
          summaryRows: currentSummaryRows,
          regionalEstimate: currentRegionalEstimate || null,
        },
        sourceFiles,
        summary: {
          month,
          rowCount: sourceFiles.length,
          hasRegionalEstimate: Boolean(currentRegionalEstimate),
        },
      }
    : null;
  const autoSaveKey = autoSaveRequest
    ? `platform-kpis-${importGeneration}-${currentRegionalEstimate ? 'regional' : 'platform-only'}`
    : null;
  const autoSave = useAutoImport(autoSaveRequest, autoSaveKey, {
    onSaved: loadSavedHistory,
    onRolledBack: loadSavedHistory,
  });

  const setMetricUpload = (metricType) => (rows, fields, sourceFileName) => {
    validatePlatformUpload(rows, metricType);
    setUploads((prev) => ({ ...prev, [metricType]: rows }));
    setUploadSources((prev) => ({ ...prev, [metricType]: sourceFileName || prev[metricType] }));
    setRegionalInputs(createEmptyRegionalInputs());
    setImportGeneration((current) => current + 1);
  };

  const handleZipUpload = async (file) => {
    const files = await parseLookerZip(file);
    const platformFiles = {
      mau: selectPlatformMetricFile(files, 'mau', 'active_accounts.csv'),
      mad: selectPlatformMetricFile(files, 'mad', 'active_devices.csv'),
      hrs: selectPlatformMetricFile(files, 'hrs', 'playback_hours.csv'),
    };

    if (!platformFiles.mau || !platformFiles.mad || !platformFiles.hrs) {
      throw new Error('Zip did not include recognizable active accounts, active devices, and playback hours platform CSVs.');
    }

    const nextUploads = {
      mau: platformFiles.mau.rows,
      mad: platformFiles.mad.rows,
      hrs: platformFiles.hrs.rows,
    };

    validatePlatformUpload(nextUploads.mau, 'mau');
    validatePlatformUpload(nextUploads.mad, 'mad');
    validatePlatformUpload(nextUploads.hrs, 'hrs');

    const regionalActiveAccountFile = pickNamedFile(files, ['active_accounts_(data).csv', 'active_accounts.csv']);
    const regionalPlaybackHoursFile = pickNamedFile(files, ['playback_hours_(data).csv', 'playback_hours.csv']);
    const regionalDeviceDistributionFile = pickNamedFile(files, ['regional_device_distribution.csv']);
    const averageDailyActiveDevicesFile = pickNamedFile(files, ['average_daily_active_devices.csv']);

    setUploads((prev) => ({ ...prev, ...nextUploads }));
    setUploadSources({
      mau: platformFiles.mau.name,
      mad: platformFiles.mad.name,
      hrs: platformFiles.hrs.name,
    });
    setRegionalInputs({
      activeAccountText: regionalActiveAccountFile?.rawText || '',
      activeAccountFileName: regionalActiveAccountFile?.name || '',
      playbackHoursText: regionalPlaybackHoursFile?.rawText || '',
      playbackHoursFileName: regionalPlaybackHoursFile?.name || '',
      regionalDeviceDistributionText: regionalDeviceDistributionFile?.rawText || '',
      regionalDeviceDistributionFileName: regionalDeviceDistributionFile?.name || '',
      averageDailyActiveDevicesText: averageDailyActiveDevicesFile?.rawText || '',
      averageDailyActiveDevicesFileName: averageDailyActiveDevicesFile?.name || '',
      zipFileName: file.name,
    });
    setImportGeneration((current) => current + 1);

    const detectedRegionalCount = [
      regionalActiveAccountFile,
      regionalPlaybackHoursFile,
      regionalDeviceDistributionFile,
      averageDailyActiveDevicesFile,
    ].filter(Boolean).length;

    return {
      status: 'ok',
      message: `Loaded ${files.length} CSVs from ${file.name}. Regional estimate inputs detected: ${detectedRegionalCount}/4.`,
    };
  };

  const generateConfluence = () => {
    if (!summaryRows.length) return '';

    const platformSection = [
      `<h3>Business KPIs / Program KPIs (D+) — ${month}</h3>`,
      ...summaryRows.map((row) => (
        `${row.entity}: MAU ${compactNumber(row.current.mau, 2)} (${formatChange(row.mauMoM)}) | MAD ${compactNumber(row.current.mad, 2)} (${formatChange(row.madMoM)}) | Playback Hrs ${compactNumber(row.current.hrs, 2)} (${formatChange(row.hrsMoM)}) | HPV ${formatHpv(row.current.hpv)} (${formatChange(row.hpvMoM)})`
      )),
    ].join('\n');

    if (!regionalSummaryRows.length) return platformSection;

    const regionalSection = [
      `<h3>Regional KPI Estimates — ${formatDateLabel(currentRegionalEstimate?.month || month)}</h3>`,
      `<p><em>${REGIONAL_ESTIMATE_DISCLAIMER} Directly region-coded partners stay assigned to those regions. Global or unmapped partners are distributed proportionally from the observed direct partner mix, which can bias results if the unmapped base behaves differently.</em></p>`,
      ...(currentRegionalEstimate?.fallbackMetrics?.length
        ? [`⚠️ Note: ${currentRegionalEstimate.fallbackMetrics.join(', ')} used equal-split fallback allocation (no direct partner-region matches found).`]
        : []),
      ...regionalSummaryRows.map((row) => (
        `${row.region}: MAU ${compactNumber(row.current.mau, 2)} (${formatChange(row.mauMoM)}) | MAD ${compactNumber(row.current.mad, 2)} (${formatChange(row.madMoM)}) | Playback Hrs ${compactNumber(row.current.hrs, 2)} (${formatChange(row.hrsMoM)})`
      )),
      `TOTAL: MAU ${compactNumber(regionalTotals.mau, 2)} (${formatChange(regionalTotalChanges.mau)}) | MAD ${compactNumber(regionalTotals.mad, 2)} (${formatChange(regionalTotalChanges.mad)}) | Playback Hrs ${compactNumber(regionalTotals.hrs, 2)} (${formatChange(regionalTotalChanges.hrs)})`,
    ].join('\n');

    return `${platformSection}\n\n${regionalSection}`;
  };

  const copy = () => {
    navigator.clipboard.writeText(generateConfluence());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mappingImportedAtMs = timestampToMs(mappingMeta?.importedAt);
  const mixRows = currentRegionalEstimate
    ? [
        { metric: 'MAU', values: currentRegionalEstimate.directMixByMetric.mau },
        { metric: 'MAD', values: currentRegionalEstimate.directMixByMetric.mad },
        { metric: 'Playback Hours', values: currentRegionalEstimate.directMixByMetric.hrs },
      ]
    : [];

  return (
    <div>
      <div className="section-header">
        <span className="section-badge badge-monthly">Monthly</span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>Platform &amp; Regional KPIs</h2>
      </div>

      <div className="instructions">
        <h4>ℹ️ How to get this data</h4>
        <ol>
          <li>Open the <a href="https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust" target="_blank" rel="noreferrer">D+ Device Health &amp; Status Dashboard V2.0</a>.</li>
          <li>Set <strong>Date Granularity</strong> = Monthly, <strong>Date Range</strong> = last 1 complete month, <strong>Device Family</strong> = rust.</li>
          <li>Download the Looker zip and upload it below. The page will load platform KPI files and the regional estimation inputs from the same zip when available.</li>
          <li>If regional estimates are unavailable, import the latest mapping CSV in <Link to="/partner-region-mapping" style={{ fontWeight: 700 }}>Partner Region Mapping</Link> or use the three manual CSV cards below for a platform-only fallback.</li>
        </ol>
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <a className="source-link" href="https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust" target="_blank" rel="noreferrer">🔗 Open Looker Dashboard</a>
          <Link className="source-link" to="/partner-region-mapping">🗺️ Manage Partner Region Mapping</Link>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Upload Looker Zip</div>
        <div className="card-subtitle">Preferred path. The app detects the platform KPI CSVs plus the regional active accounts, playback hours, regional device distribution, and average daily active devices files automatically.</div>
        <UploadZone label="Drop Looker ZIP here" hint="Upload the zipped Looker export" accept=".zip" onFileSelected={handleZipUpload} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 20 }}>
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
            ✅ Platform KPIs loaded for {summaryRows[0]?.month}. MAU, MAD, Playback Hours, and HPV are merged across the monthly Looker exports.
          </div>

          <AutoSaveStatus
            label={workflowLabel}
            status={regionalWaitsForMappings ? 'saving' : autoSave.status}
            error={regionalWaitsForMappings ? '' : autoSave.error}
            importedAtMs={autoSave.importedAtMs}
            rollbackUntilMs={autoSave.rollbackUntilMs}
            onRollback={autoSave.rollback}
          />

          <div className="card">
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div>
                <div className="card-title">📈 Platform Trend Chart</div>
                <div className="card-subtitle">Switch between MAU, MAD, Playback Hours, and HPV.</div>
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
                  <Line key={platform} type="monotone" dataKey={platform} stroke={PLATFORM_COLORS[platform]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-title">📊 Platform KPI Summary</div>
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

          <div id="region-estimates" className="card">
            <div className="card-title">🌍 Regional KPI Estimates</div>
            <div className="card-subtitle">Regional MAU, MAD, and Playback Hours are estimated from partner mapping and Looker partner-level inputs.</div>

            <div className="alert alert-info" style={{ marginTop: 16 }}>
              ℹ️ <strong>Estimation model:</strong> {REGIONAL_ESTIMATE_DISCLAIMER} Directly region-coded partners stay assigned to those regions. Global or unmapped partners are distributed proportionally using the observed mix from directly mapped partners. This can bias results if the global or unmapped partner base has a different regional footprint.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16, marginBottom: 16 }}>
              <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
                <div className="card-subtitle">Active Accounts Input</div>
                <div className="card-title" style={{ marginBottom: 6 }}>{statusLabel(Boolean(regionalInputs.activeAccountText), regionalInputs.activeAccountFileName)}</div>
              </div>
              <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
                <div className="card-subtitle">Playback Hours Input</div>
                <div className="card-title" style={{ marginBottom: 6 }}>{statusLabel(Boolean(regionalInputs.playbackHoursText), regionalInputs.playbackHoursFileName)}</div>
              </div>
              <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
                <div className="card-subtitle">Regional Device Mix</div>
                <div className="card-title" style={{ marginBottom: 6 }}>{statusLabel(Boolean(regionalInputs.regionalDeviceDistributionText), regionalInputs.regionalDeviceDistributionFileName)}</div>
              </div>
              <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
                <div className="card-subtitle">Average Daily Active Devices</div>
                <div className="card-title" style={{ marginBottom: 6 }}>{statusLabel(Boolean(regionalInputs.averageDailyActiveDevicesText), regionalInputs.averageDailyActiveDevicesFileName)}</div>
              </div>
              <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
                <div className="card-subtitle">Partner Mapping</div>
                <div className="card-title" style={{ marginBottom: 6 }}>
                  {mappingLoading
                    ? 'Loading…'
                    : partnerMappings.length
                      ? mappingMeta?.sourceFileName || `${partnerMappings.length} rows loaded`
                      : 'Missing'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {mappingImportedAtMs ? formatImportTimestamp(mappingImportedAtMs) : 'Import Sheet 1 CSV to enable estimates'}
                </div>
              </div>
            </div>

            {!partnerMappings.length && !mappingLoading && (
              <div className="alert alert-warning">
                Import the Sheet 1 CSV in <Link to="/partner-region-mapping" style={{ fontWeight: 700 }}>Partner Region Mapping</Link> to enable the regional estimate model.
              </div>
            )}

            {mappingError && (
              <div className="alert alert-error">
                Unable to load the partner-region mapping. {mappingError}
              </div>
            )}

            {regionalEstimateError && (
              <div className="alert alert-warning">
                {regionalEstimateError}
              </div>
            )}

            {currentRegionalEstimate?.fallbackMetrics?.length > 0 && (
              <div className="alert alert-warning">
                No directly mapped regional base was available for {currentRegionalEstimate.fallbackMetrics.join(', ')}, so the model used an even 25/25/25/25 regional split for that metric.
              </div>
            )}

            {!currentRegionalEstimate && !regionalEstimateError && (
              <div className="empty-state" style={{ paddingTop: 24, paddingBottom: 24 }}>
                <div className="empty-state-icon">🧩</div>
                <h3>Regional estimate not ready yet</h3>
                <p>Upload a Looker zip that includes the four regional input files and make sure a partner mapping CSV has already been imported.</p>
              </div>
            )}

            {currentRegionalEstimate && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 12, marginBottom: 20 }}>
                  <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
                    <div className="card-subtitle">Estimate Month</div>
                    <div className="card-title" style={{ marginBottom: 0 }}>{formatDateLabel(currentRegionalEstimate.month)}</div>
                  </div>
                  <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
                    <div className="card-subtitle">Total MAU</div>
                    <div className="card-title" style={{ marginBottom: 0 }}>{compactNumber(regionalTotals.mau, 2)}</div>
                  </div>
                  <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
                    <div className="card-subtitle">Total MAD</div>
                    <div className="card-title" style={{ marginBottom: 0 }}>{compactNumber(regionalTotals.mad, 2)}</div>
                  </div>
                  <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
                    <div className="card-subtitle">Total Playback Hrs</div>
                    <div className="card-title" style={{ marginBottom: 0 }}>{compactNumber(regionalTotals.hrs, 2)}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
                  <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-title">🥧 Estimated MAU Share by Region</div>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={regionalPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={(entry) => `${entry.name}: ${entry.pct}`}
                          labelLine={false}
                        >
                          {regionalPieData.map((entry) => <Cell key={entry.name} fill={REGION_COLORS[entry.name]} />)}
                        </Pie>
                        <Tooltip formatter={(value) => compactNumber(value, 2)} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-title">📊 Regional Estimate Summary</div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Region</th>
                          <th>MAU</th>
                          <th>MoM</th>
                          <th>MAD</th>
                          <th>MoM</th>
                          <th>Playback Hrs</th>
                          <th>MoM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {regionalSummaryRows.map((row) => (
                          <tr key={row.region}>
                            <td style={{ fontWeight: 700 }}>{row.region}</td>
                            <td className="num">{compactNumber(row.current?.mau, 2)}</td>
                            <td className={getChangeClass(row.mauMoM)}>{formatChange(row.mauMoM)}</td>
                            <td className="num">{compactNumber(row.current?.mad, 2)}</td>
                            <td className={getChangeClass(row.madMoM)}>{formatChange(row.madMoM)}</td>
                            <td className="num">{compactNumber(row.current?.hrs, 2)}</td>
                            <td className={getChangeClass(row.hrsMoM)}>{formatChange(row.hrsMoM)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ fontWeight: 700 }}>TOTAL</td>
                          <td className="num">{compactNumber(regionalTotals.mau, 2)}</td>
                          <td className={getChangeClass(regionalTotalChanges.mau)}>{formatChange(regionalTotalChanges.mau)}</td>
                          <td className="num">{compactNumber(regionalTotals.mad, 2)}</td>
                          <td className={getChangeClass(regionalTotalChanges.mad)}>{formatChange(regionalTotalChanges.mad)}</td>
                          <td className="num">{compactNumber(regionalTotals.hrs, 2)}</td>
                          <td className={getChangeClass(regionalTotalChanges.hrs)}>{formatChange(regionalTotalChanges.hrs)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 20, marginBottom: 0 }}>
                  <div className="card-title">🧭 Direct-Mapped Allocation Mix</div>
                  <div className="card-subtitle">Global or unmapped partners are redistributed using these direct-partner regional weights.</div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        {ESTIMATE_REGIONS.map((region) => <th key={region}>{region}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {mixRows.map((row) => (
                        <tr key={row.metric}>
                          <td style={{ fontWeight: 700 }}>{row.metric}</td>
                          {ESTIMATE_REGIONS.map((region) => (
                            <td key={region} className="num">{formatMixValue(row.values?.[region])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-title">🚀 Confluence Output</div>
            <div className="card-subtitle">Includes the platform section and, when available, the regional estimation section with the model disclaimer.</div>
            <div className="output-preview">{generateConfluence()}</div>
            <div className="output-actions">
              <button className="btn btn-primary" onClick={copy}>{copied ? '✅ Copied!' : '📋 Copy to Clipboard'}</button>
            </div>
          </div>
        </>
      )}

      {!summaryRows.length && (historyLoading || mappingLoading) && (
        <div className="card">
          <div className="empty-state" style={{ paddingTop: 24, paddingBottom: 24 }}>
            <div className="empty-state-icon">⏳</div>
            <h3>Loading monthly context…</h3>
            <p>Historical monthly snapshots and partner mapping metadata are loading.</p>
          </div>
        </div>
      )}
    </div>
  );
}
