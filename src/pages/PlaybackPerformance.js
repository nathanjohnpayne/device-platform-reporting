import React, { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import AutoSaveStatus from '../components/AutoSaveStatus';
import ChartWrapper from '../components/ChartWrapper';
import ConfluenceCopyButtons from '../components/ConfluenceCopyButtons';
import ConfluencePreview from '../components/ConfluencePreview';
import ConflictDialog from '../components/ConflictDialog';
import UploadZone from '../components/UploadZone';
import useAutoImport from '../hooks/useAutoImport';
import { parseConvivaPlaybackRows } from '../utils/conviva';
import {
  FALLBACK_COLORS,
  METRIC_ORDER,
  buildPlaybackAnalysis,
  formatMetricValue,
  metricFormatter,
} from '../utils/playback';
import {
  classifyMetric,
  formatChange,
  getChangeClass,
  htmlToMarkdown,
  htmlToPlainText,
  humanizeMetric,
  parseNumber,
  toPercentChange,
} from '../utils/reporting';

export default function PlaybackPerformance() {
  const [data, setData] = useState(null);
  const [importGeneration, setImportGeneration] = useState(0);
  const [importMeta, setImportMeta] = useState({
    sourceFiles: [],
    savedConfig: null,
  });
  const [config, setConfig] = useState({
    vsfThreshold: 98.5,
    vpfThreshold: 96.5,
    anomalyThreshold: 10,
  });

  const analysis = buildPlaybackAnalysis(data, config);
  const recognizedMetricCount = Object.values(analysis.metricSeries).reduce((sum, items) => sum + items.length, 0);
  const savedAnalysis = buildPlaybackAnalysis(data, importMeta.savedConfig || config);
  const weekOf = new Date().toISOString().slice(0, 10);

  const autoSaveRequest = data && recognizedMetricCount && importGeneration
    ? {
        type: 'playbackPerformance',
        label: 'Playback Performance',
        collectionName: 'weeklySnapshots',
        data: {
          type: 'playbackPerformance',
          rows: data,
          analysis: {
            latestLabel: savedAnalysis.latestLabel,
            narrative: savedAnalysis.narrative,
            thresholds: importMeta.savedConfig || config,
          },
          weekOf,
        },
        fingerprintData: {
          rows: data,
        },
        sourceFiles: importMeta.sourceFiles,
        periodField: 'weekOf',
        periodKey: weekOf,
        summary: {
          weekOf,
          rowCount: data.length,
          metricSeriesCount: recognizedMetricCount,
        },
      }
    : null;
  const autoSave = useAutoImport(autoSaveRequest, autoSaveRequest ? `playback-${importGeneration}` : null);

  const onParsed = (rows, sourceFileName = '') => {
    setData(rows);
    setImportMeta({
      sourceFiles: sourceFileName ? [sourceFileName] : [],
      savedConfig: { ...config },
    });
    setImportGeneration((current) => current + 1);
  };

  const handleConvivaUpload = async (file) => {
    const text = await file.text();
    const rows = parseConvivaPlaybackRows(text);
    const seriesCount = [...new Set(
      rows.flatMap((row) => Object.keys(row).filter((key) => key !== 'Timestamp' && classifyMetric(key)))
    )].length;

    if (!seriesCount) {
      throw new Error('This Conviva export did not contain readable Playback Performance sections. Upload the dashboard CSV export, not the app-version detail table.');
    }

    onParsed(rows, file.name);

    return {
      status: 'ok',
      message: `${rows.length.toLocaleString()} time points loaded across ${seriesCount} playback series`,
    };
  };

  const generateConfluence = () => {
    if (!recognizedMetricCount) return '';

    const sections = METRIC_ORDER
      .filter((metric) => analysis.metricSeries[metric]?.length)
      .map((metric) => {
        const lines = analysis.metricSeries[metric]
          .map((series) => `<li>${series.label}: <strong>${formatMetricValue(metric, analysis.chartData[analysis.chartData.length - 1]?.[series.key])}</strong></li>`)
          .join('');
        return `<h4>${humanizeMetric(metric)} (${analysis.latestLabel})</h4><ul>${lines}</ul>
<!-- [CHART: Playback Performance — ${humanizeMetric(metric)} (30-day trend)]
     Paste chart image here. Use Copy Chart button above, then Insert > Image in Confluence. -->`;
      })
      .join('\n');

    const narrative = analysis.narrative.map((line) => `<li>${line}</li>`).join('');

    return `<h3>Playback Performance (Last 30 Days)</h3>
<p>Latest data point: ${analysis.latestLabel}</p>
<ul>${narrative}</ul>
${sections}`;
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
          onFileSelected={handleConvivaUpload}
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

          <AutoSaveStatus
            label="Playback Performance"
            status={autoSave.status}
            error={autoSave.error}
            importedAtMs={autoSave.importedAtMs}
            rollbackUntilMs={autoSave.rollbackUntilMs}
            onRollback={autoSave.rollback}
          />

          {autoSave.status === 'conflict' && autoSave.conflictData && (
            <ConflictDialog
              existingSnapshot={autoSave.conflictData.existingSnapshot}
              newSnapshotRequest={autoSave.conflictData.newSnapshotRequest}
              onKeep={() => autoSave.resolveConflict('keep')}
              onReplace={() => autoSave.resolveConflict('replace')}
              busy={autoSave.conflictResolving}
            />
          )}

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
              <ChartWrapper title={`Playback Performance — ${humanizeMetric(metric)}`} height={280}>
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
              </ChartWrapper>
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
            <ConfluenceCopyButtons
              textContent={htmlToPlainText(generateConfluence())}
              markdownContent={htmlToMarkdown(generateConfluence())}
            />
            <ConfluencePreview content={generateConfluence()} />
          </div>
        </>
      )}
    </div>
  );
}
