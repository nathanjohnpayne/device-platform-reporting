// pages/SnapshotDetail.js
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import { doc, getDoc } from 'firebase/firestore';
import ChartWrapper from '../components/ChartWrapper';
import ConfluenceCopyButtons from '../components/ConfluenceCopyButtons';
import { db } from '../firebase';
import { formatImportTimestamp, timestampToMs } from '../utils/importHistory';
import { buildTrendData } from '../utils/looker';
import {
  FALLBACK_COLORS,
  METRIC_ORDER,
  buildPlaybackAnalysis,
  formatMetricValue,
  metricFormatter,
} from '../utils/playback';
import {
  compactNumber,
  formatChange,
  formatDateLabel,
  formatPercent,
  getChangeClass,
  htmlToMarkdown,
  htmlToPlainText,
  humanizeMetric,
  toPercentChange,
} from '../utils/reporting';

const ALLOWED_COLLECTIONS = ['weeklySnapshots', 'adkVersionShare', 'partnerMigration', 'monthlySnapshots'];

const PLATFORM_COLORS = { PlayStation: '#3b82f6', Xbox: '#10b981', ADK: '#f59e0b' };
const ADK_COLORS = ['#1e3a8a', '#7c3aed', '#f59e0b', '#10b981', '#ec4899', '#14b8a6'];

// ---- Playback replay -------------------------------------------------------

function PlaybackReplay({ snapshot }) {
  const { rows, analysis: savedAnalysis } = snapshot;
  const thresholds = savedAnalysis?.thresholds || { vsfThreshold: 98.5, vpfThreshold: 96.5, anomalyThreshold: 10 };

  if (!rows?.length) {
    return <div className="alert alert-warning">Full replay not available — raw rows not stored in this snapshot.</div>;
  }

  const analysis = buildPlaybackAnalysis(rows, thresholds);
  const narrativeText = analysis.narrative.map((line) => `  • ${line}`).join('\n');
  const textContent = `PLAYBACK PERFORMANCE (LAST 30 DAYS)\nLatest: ${analysis.latestLabel}\n\n${narrativeText}`;
  const mdContent = `### Playback Performance (Last 30 Days)\n\nLatest: ${analysis.latestLabel}\n\n${analysis.narrative.map((l) => `- ${l}`).join('\n')}`;

  return (
    <>
      <div className="card">
        <div className="card-title">📝 Narrative Summary</div>
        <ul style={{ paddingLeft: 18 }}>
          {analysis.narrative.map((line) => <li key={line} style={{ marginBottom: 8, color: '#334155', lineHeight: 1.5 }}>{line}</li>)}
        </ul>
        <ConfluenceCopyButtons textContent={textContent} markdownContent={mdContent} />
      </div>
      {METRIC_ORDER.filter((metric) => analysis.metricSeries[metric]?.length).map((metric) => (
        <div key={metric} className="card">
          <div className="card-title">📈 {humanizeMetric(metric)}</div>
          <ChartWrapper title={`Playback Performance — ${humanizeMetric(metric)}`} height={280}>
            <LineChart data={analysis.chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={18} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => metricFormatter(metric, v)} />
              <Tooltip formatter={(v) => metricFormatter(metric, v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {analysis.metricSeries[metric].map((series, i) => (
                <Line key={series.key} type="monotone" dataKey={series.key} stroke={FALLBACK_COLORS[i % FALLBACK_COLORS.length]} strokeWidth={2} dot={false} name={series.label} />
              ))}
            </LineChart>
          </ChartWrapper>
        </div>
      ))}
    </>
  );
}

// ---- ADK Version Share replay -----------------------------------------------

function AdkReplay({ snapshot }) {
  const { shares, trendData, latestLabel } = snapshot;

  if (!shares?.length) {
    return <div className="alert alert-warning">Full replay not available — version shares not stored in this snapshot.</div>;
  }

  const lines = shares.map((item) => `<li>${item.name}: <strong>${item.pct}</strong> (${item.value?.toLocaleString() || '?'} unique devices)</li>`).join('');
  const html = `<h3>ADK Version Share</h3><p>Latest Conviva point: ${latestLabel}</p><ul>${lines}</ul>`;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-title">🥧 Latest ADK Version Share</div>
          <ChartWrapper title="ADK Version Share — Unique Devices by Version" height={260}>
            <PieChart>
              <Pie data={shares} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, pct }) => `${name}: ${pct}`} labelLine={false}>
                {shares.map((_, i) => <Cell key={i} fill={ADK_COLORS[i % ADK_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => compactNumber(v, 1)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ChartWrapper>
        </div>

        {trendData?.length > 1 && (
          <div className="card">
            <div className="card-title">📈 30-day Trend</div>
            <ChartWrapper title="ADK Version Share — Unique Devices With Attempts" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={18} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => compactNumber(v, 1)} />
                <Tooltip formatter={(v) => compactNumber(v, 1)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {[...new Set(trendData.flatMap((r) => Object.keys(r).filter((k) => !['date', 'label', 'total'].includes(k))))].map((label, i) => (
                  <Line key={label} type="monotone" dataKey={label} name={label} stroke={ADK_COLORS[i % ADK_COLORS.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ChartWrapper>
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-title">🚀 Confluence Output</div>
        <ConfluenceCopyButtons textContent={htmlToPlainText(html)} markdownContent={htmlToMarkdown(html)} />
      </div>
    </>
  );
}

// ---- Partner Migration replay -----------------------------------------------

function PartnerMigrationReplay({ snapshot }) {
  const { partners, currentGa, thresholds } = snapshot;

  if (!partners?.length) {
    return <div className="alert alert-warning">Full replay not available — partner data not stored in this snapshot.</div>;
  }

  const legacyAlertPct = thresholds?.legacyAlertPct ?? 0;
  const legacyPartners = partners.filter((p) => p.legacyPct > legacyAlertPct);
  const allVersions = [...new Set(partners.flatMap((p) => Object.keys(p.versions || {})))];
  const notesText = legacyPartners.length === 0
    ? `All partners are fully migrated to ${currentGa}.`
    : legacyPartners.map((p) => `${p.partner}: ${Number(p.legacyPct).toFixed(1)}% on legacy ADK (${p.legacyCount?.toLocaleString() || '?'} of ${p.total?.toLocaleString() || '?'} devices)`).join('\n');

  return (
    <>
      <div className="card">
        <div className="card-title">Partner Migration Table</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Total</th>
                {allVersions.map((v) => <th key={v}>{v}</th>)}
                <th>Legacy %</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.partner}>
                  <td style={{ fontWeight: 600 }}>{p.partner}</td>
                  <td className="num">{p.total?.toLocaleString() || '—'}</td>
                  {allVersions.map((v) => <td key={v} className="num">{(p.versions?.[v] || 0).toLocaleString()}</td>)}
                  <td className={p.legacyPct > legacyAlertPct ? 'neg' : 'pos'}>{Number(p.legacyPct).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="card-title">📝 Confluence Notes</div>
        <ConfluenceCopyButtons textContent={notesText} markdownContent={notesText.split('\n').filter(Boolean).map((l) => `- ${l}`).join('\n')} />
        <pre style={{ marginTop: 8, fontSize: 12, color: '#64748b', whiteSpace: 'pre-wrap' }}>{notesText}</pre>
      </div>
    </>
  );
}

// ---- Platform / Regional KPIs replay ----------------------------------------

function PlatformKpisReplay({ snapshot }) {
  const { seriesByPlatform, summaryRows } = snapshot;
  const PLATFORM_ORDER = ['PlayStation', 'Xbox', 'ADK'];

  if (!seriesByPlatform || !summaryRows?.length) {
    return <div className="alert alert-warning">Full replay not available — series data not stored in this snapshot.</div>;
  }

  const trendData = buildTrendData(seriesByPlatform, 'mau');
  const text = summaryRows.map((row) => (
    `${row.entity}: MAU ${compactNumber(row.current?.mau, 2)} (${formatChange(toPercentChange(row.current?.mau, row.previous?.mau))}) | MAD ${compactNumber(row.current?.mad, 2)} | Hrs ${compactNumber(row.current?.hrs, 2)}`
  )).join('\n');

  return (
    <>
      <div className="card">
        <div className="card-title">📈 Platform MAU Trend</div>
        <ChartWrapper title="Platform KPIs — MAU Trend" height={260}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => compactNumber(v, 1)} />
            <Tooltip formatter={(v) => compactNumber(v, 1)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {PLATFORM_ORDER.filter((p) => summaryRows.some((r) => r.entity === p)).map((p) => (
              <Line key={p} type="monotone" dataKey={p} stroke={PLATFORM_COLORS[p]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ChartWrapper>
      </div>
      <div className="card">
        <div className="card-title">📊 Platform KPI Summary</div>
        <table className="data-table">
          <thead>
            <tr><th>Platform</th><th>MAU</th><th>MoM</th><th>MAD</th><th>MoM</th><th>Hrs</th><th>MoM</th></tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => (
              <tr key={row.entity}>
                <td style={{ fontWeight: 700 }}>{row.entity}</td>
                <td className="num">{compactNumber(row.current?.mau, 2)}</td>
                <td className={getChangeClass(row.mauMoM)}>{formatChange(row.mauMoM)}</td>
                <td className="num">{compactNumber(row.current?.mad, 2)}</td>
                <td className={getChangeClass(row.madMoM)}>{formatChange(row.madMoM)}</td>
                <td className="num">{compactNumber(row.current?.hrs, 2)}</td>
                <td className={getChangeClass(row.hrsMoM)}>{formatChange(row.hrsMoM)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-title">🚀 Confluence Output</div>
        <ConfluenceCopyButtons textContent={text} markdownContent={text.split('\n').filter(Boolean).map((l) => `- ${l}`).join('\n')} />
      </div>
    </>
  );
}

// ---- Main page --------------------------------------------------------------

export default function SnapshotDetail() {
  const { collection: collectionName, snapshotId } = useParams();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ALLOWED_COLLECTIONS.includes(collectionName)) {
      setError('Unknown collection.');
      setLoading(false);
      return;
    }

    getDoc(doc(db, collectionName, snapshotId))
      .then((snap) => {
        if (!snap.exists()) {
          setError('Snapshot not found.');
        } else {
          setSnapshot({ id: snap.id, ...snap.data() });
        }
      })
      .catch((err) => setError(err.message || 'Failed to load snapshot.'))
      .finally(() => setLoading(false));
  }, [collectionName, snapshotId]);

  if (loading) {
    return (
      <div className="card">
        <div className="empty-state" style={{ paddingTop: 32 }}>
          <div className="empty-state-icon">⏳</div>
          <h3>Loading snapshot…</h3>
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="card">
        <div className="alert alert-error">{error || 'Snapshot not found.'}</div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('/history')}>← Back to History</button>
      </div>
    );
  }

  const uploadedAtMs = timestampToMs(snapshot.uploadedAt);
  const isSuperseded = Boolean(snapshot.supersededAt);

  return (
    <div>
      <div className="section-header" style={{ gap: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/history')}>← History</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744', marginLeft: 8 }}>
          {snapshot.importLabel || snapshot.workflowLabel || collectionName}
        </h2>
        <span style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11, padding: '3px 8px', color: '#64748b', fontWeight: 600 }}>
          READ-ONLY
        </span>
        {isSuperseded && (
          <span style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 4, fontSize: 11, padding: '3px 8px', color: '#92400e', fontWeight: 600 }}>
            REPLACED
          </span>
        )}
      </div>

      <div className="alert alert-info">
        ℹ️ Snapshot saved: {uploadedAtMs ? formatImportTimestamp(uploadedAtMs) : '—'}
        {snapshot.weekOf ? ` · Week of ${snapshot.weekOf}` : ''}
        {snapshot.month ? ` · Month: ${snapshot.month}` : ''}
        {snapshot.sourceFiles?.length ? ` · Sources: ${snapshot.sourceFiles.join(', ')}` : ''}
      </div>

      {collectionName === 'weeklySnapshots' && <PlaybackReplay snapshot={snapshot} />}
      {collectionName === 'adkVersionShare' && <AdkReplay snapshot={snapshot} />}
      {collectionName === 'partnerMigration' && <PartnerMigrationReplay snapshot={snapshot} />}
      {collectionName === 'monthlySnapshots' && <PlatformKpisReplay snapshot={snapshot} />}
    </div>
  );
}
