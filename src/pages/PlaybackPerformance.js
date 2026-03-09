import React, { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import UploadZone from '../components/UploadZone';
import { db } from '../firebase';
import {
  classifyMetric,
  compactNumber,
  compareDateValues,
  formatChange,
  formatDateLabel,
  formatPercent,
  getChangeClass,
  guessDateKey,
  humanizeMetric,
  normalizeDateValue,
  parseNumber,
  toPercentChange,
} from '../utils/reporting';

const METRIC_ORDER = ['attempts', 'uniqueDevices', 'vsf', 'vpf'];
const FALLBACK_COLORS = ['#3b82f6', '#1e3a8a', '#f59e0b', '#7c3aed', '#ec4899', '#10b981', '#14b8a6', '#f97316'];

function formatSeriesLabel(key) {
  const cleaned = String(key)
    .replace(/vsf-?t?/ig, '')
    .replace(/vpf-?t?/ig, '')
    .replace(/unique devices with attempts/ig, '')
    .replace(/unique devices/ig, '')
    .replace(/attempts/ig, '')
    .replace(/\bvalue\b/ig, '')
    .replace(/[|:_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || key;
}

function formatMetricValue(metric, value) {
  if (value == null) return '—';
  if (metric === 'vsf' || metric === 'vpf') return formatPercent(value, 2);
  return compactNumber(value, 1);
}

function buildPlaybackAnalysis(rows, config) {
  if (!rows?.length) return { chartData: [], metricSeries: {}, narrative: [], latestLabel: '', latestPoints: {} };

  const dateKey = guessDateKey(rows[0]);
  const numericKeys = Object.keys(rows[0]).filter((key) => rows.some((row) => parseNumber(row[key]) != null));
  const metricSeries = { attempts: [], uniqueDevices: [], vsf: [], vpf: [] };

  numericKeys.forEach((key) => {
    const metric = classifyMetric(key);
    if (!metric) return;
    metricSeries[metric].push({ key, label: formatSeriesLabel(key) });
  });

  const chartData = rows
    .map((row, index) => {
      const rawDate = dateKey ? row[dateKey] : '';
      const date = normalizeDateValue(rawDate) || `point-${String(index + 1).padStart(2, '0')}`;
      const entry = {
        date,
        label: rawDate ? formatDateLabel(rawDate) : `Point ${index + 1}`,
      };

      numericKeys.forEach((key) => {
        const value = parseNumber(row[key]);
        if (value != null) entry[key] = value;
      });

      return entry;
    })
    .sort((left, right) => compareDateValues(left.date, right.date));

  const latest = chartData[chartData.length - 1] || {};
  const previous = chartData[chartData.length - 2] || {};
  const latestLabel = latest.label || 'latest';
  const latestPoints = {};
  const narrative = [];

  ['vsf', 'vpf'].forEach((metric) => {
    const ranked = metricSeries[metric]
      .map((series) => ({ ...series, value: latest[series.key] }))
      .filter((series) => series.value != null)
      .sort((left, right) => right.value - left.value);

    if (!ranked.length) return;

    const leader = ranked[0];
    latestPoints[metric] = leader;
    narrative.push(`Highest ${humanizeMetric(metric)} on ${latestLabel}: ${leader.label} at ${formatMetricValue(metric, leader.value)}.`);

    const threshold = metric === 'vsf' ? config.vsfThreshold : config.vpfThreshold;
    const underTarget = ranked.filter((series) => series.value < threshold);
    if (underTarget.length) {
      const worst = underTarget[underTarget.length - 1];
      narrative.push(`${humanizeMetric(metric)} below target (${formatPercent(threshold, 1)}) on ${worst.label}: ${formatMetricValue(metric, worst.value)}. Needs investigation.`);
    }
  });

  ['attempts', 'uniqueDevices'].forEach((metric) => {
    const ranked = metricSeries[metric]
      .map((series) => ({ ...series, value: latest[series.key] }))
      .filter((series) => series.value != null)
      .sort((left, right) => right.value - left.value);

    if (!ranked.length) return;
    const leader = ranked[0];
    latestPoints[metric] = leader;
    narrative.push(`Largest ${humanizeMetric(metric)} on ${latestLabel}: ${leader.label} with ${formatMetricValue(metric, leader.value)}.`);
  });

  const anomalies = METRIC_ORDER.flatMap((metric) => (
    metricSeries[metric]
      .map((series) => {
        const current = latest[series.key];
        const prior = previous[series.key];
        const change = toPercentChange(current, prior);
        if (change == null || Math.abs(change) < config.anomalyThreshold) return null;
        return {
          metric,
          label: series.label,
          change,
          current,
          prior,
        };
      })
      .filter(Boolean)
  )).sort((left, right) => Math.abs(right.change) - Math.abs(left.change));

  if (anomalies.length) {
    anomalies.slice(0, 3).forEach((anomaly) => {
      narrative.push(`${anomaly.label} ${humanizeMetric(anomaly.metric)} moved ${formatChange(anomaly.change, 1)} versus the prior data point (${formatMetricValue(anomaly.metric, anomaly.prior)} → ${formatMetricValue(anomaly.metric, anomaly.current)}).`);
    });
  } else if (chartData.length > 1) {
    narrative.push(`No week-over-week anomalies exceeded the ${formatPercent(config.anomalyThreshold, 1)} change threshold.`);
  }

  return { chartData, metricSeries, narrative, latestLabel, latestPoints };
}

function metricFormatter(metric, value) {
  return metric === 'vsf' || metric === 'vpf' ? formatPercent(value, 2) : compactNumber(value, 1);
}

export default function PlaybackPerformance() {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState({
    vsfThreshold: 98.5,
    vpfThreshold: 96.5,
    anomalyThreshold: 10,
  });

  const analysis = buildPlaybackAnalysis(data, config);
  const recognizedMetricCount = Object.values(analysis.metricSeries).reduce((sum, items) => sum + items.length, 0);

  const onParsed = (rows) => {
    setData(rows);
    setSaved(false);
  };

  const saveToFirestore = async () => {
    if (!data || !recognizedMetricCount) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'weeklySnapshots'), {
        type: 'playbackPerformance',
        rows: data,
        analysis: {
          latestLabel: analysis.latestLabel,
          narrative: analysis.narrative,
          thresholds: config,
        },
        uploadedAt: serverTimestamp(),
        weekOf: new Date().toISOString().slice(0, 10),
      });
      setSaved(true);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const generateConfluence = () => {
    if (!recognizedMetricCount) return '';

    const sections = METRIC_ORDER
      .filter((metric) => analysis.metricSeries[metric]?.length)
      .map((metric) => {
        const lines = analysis.metricSeries[metric]
          .map((series) => `<li>${series.label}: <strong>${formatMetricValue(metric, analysis.chartData[analysis.chartData.length - 1]?.[series.key])}</strong></li>`)
          .join('');
        return `<h4>${humanizeMetric(metric)} (${analysis.latestLabel})</h4><ul>${lines}</ul>`;
      })
      .join('\n');

    const narrative = analysis.narrative.map((line) => `<li>${line}</li>`).join('');

    return `<h3>Playback Performance (Last 30 Days)</h3>
<p>Latest data point: ${analysis.latestLabel}</p>
<ul>${narrative}</ul>
${sections}`;
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
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>Playback Performance</h2>
      </div>

      <div className="instructions">
        <h4>ℹ️ How to get this data</h4>
        <ol>
          <li>Open the <a href="https://pulse.conviva.com/app/custom-dashboards/dashboard/48643?data-source=ei" target="_blank" rel="noreferrer">Conviva: NCP+ADK Playback Performance Comparisons</a> dashboard.</li>
          <li>Set the date range to <strong>Last 30 days</strong>.</li>
          <li>Click the <strong>Export</strong> button (top right) → select <strong>CSV</strong>.</li>
          <li>Upload the exported CSV below. The app splits metric columns into Attempts, Unique Devices, VSF-T, and VPF-T automatically.</li>
        </ol>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="source-link" href="https://pulse.conviva.com/app/custom-dashboards/dashboard/48643?data-source=ei" target="_blank" rel="noreferrer">🔗 Open Conviva Dashboard</a>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Upload Conviva Export</div>
        <div className="card-subtitle">CSV export from "NCP+ADK: Playback Performance Comparisons" — last 30 days</div>
        <UploadZone
          label="Drop Conviva Playback Performance CSV here"
          hint="Export from Conviva → NCP+ADK: Playback Performance Comparisons → last 30 days"
          onParsed={onParsed}
        />
      </div>

      <div className="card">
        <div className="card-title">Analysis Settings</div>
        <div className="card-subtitle">Initial thresholds for narrative generation. Adjust if the PM wants stricter or looser flagging.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">VSF-T target %</label>
            <input className="form-input" type="number" step="0.1" value={config.vsfThreshold} onChange={(e) => setConfig((prev) => ({ ...prev, vsfThreshold: Number(e.target.value) }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">VPF-T target %</label>
            <input className="form-input" type="number" step="0.1" value={config.vpfThreshold} onChange={(e) => setConfig((prev) => ({ ...prev, vpfThreshold: Number(e.target.value) }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Anomaly threshold %</label>
            <input className="form-input" type="number" step="0.1" value={config.anomalyThreshold} onChange={(e) => setConfig((prev) => ({ ...prev, anomalyThreshold: Number(e.target.value) }))} />
          </div>
        </div>
      </div>

      {data && !recognizedMetricCount && (
        <div className="alert alert-error">
          Unable to detect playback metric columns from this export. Confirm the CSV includes Attempts, Unique Devices, VSF-T, or VPF-T columns.
        </div>
      )}

      {data && recognizedMetricCount > 0 && (
        <>
          <div className="alert alert-success">
            ✅ {data.length} rows loaded. The app recognized {recognizedMetricCount} metric series across the four playback sections.
          </div>

          <div className="card">
            <div className="card-title">📝 Narrative Summary</div>
            <div className="card-subtitle">Templated bullets for the weekly Confluence page.</div>
            <ul style={{ paddingLeft: 18 }}>
              {analysis.narrative.map((line) => <li key={line} style={{ marginBottom: 8, color: '#334155', lineHeight: 1.5 }}>{line}</li>)}
            </ul>
          </div>

          {METRIC_ORDER.filter((metric) => analysis.metricSeries[metric]?.length).map((metric) => (
            <div key={metric} className="card">
              <div className="card-title">📈 {humanizeMetric(metric)}</div>
              <div className="card-subtitle">Latest point: {analysis.latestLabel}</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={analysis.chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={18} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => metricFormatter(metric, value)} />
                  <Tooltip formatter={(value) => metricFormatter(metric, value)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {analysis.metricSeries[metric].map((series, index) => (
                    <Line key={series.key} type="monotone" dataKey={series.key} stroke={FALLBACK_COLORS[index % FALLBACK_COLORS.length]} strokeWidth={2} dot={false} name={series.label} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}

          <div className="card">
            <div className="card-title">📋 Latest Snapshot</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Series</th>
                  <th>{analysis.latestLabel}</th>
                  <th>Vs Prior Point</th>
                </tr>
              </thead>
              <tbody>
                {METRIC_ORDER.flatMap((metric) => (
                  analysis.metricSeries[metric].map((series) => {
                    const latestValue = analysis.chartData[analysis.chartData.length - 1]?.[series.key];
                    const previousValue = analysis.chartData[analysis.chartData.length - 2]?.[series.key];
                    const change = toPercentChange(latestValue, previousValue);
                    return (
                      <tr key={`${metric}-${series.key}`}>
                        <td style={{ fontWeight: 700 }}>{humanizeMetric(metric)}</td>
                        <td>{series.label}</td>
                        <td className="num">{formatMetricValue(metric, latestValue)}</td>
                        <td className={getChangeClass(change)}>{formatChange(change, 1)}</td>
                      </tr>
                    );
                  })
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-title">🚀 Confluence Output</div>
            <div className="card-subtitle">Copy this block into the Playback Performance section of the weekly Confluence page.</div>
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
