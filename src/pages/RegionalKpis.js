import React, { useState } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import AutoSaveStatus from '../components/AutoSaveStatus';
import UploadZone from '../components/UploadZone';
import useAutoImport from '../hooks/useAutoImport';
import { compactNumber, formatChange, formatDateLabel, getChangeClass, getFieldValue, normalizeDateValue, parseNumber, toPercentChange } from '../utils/reporting';

const REGIONS = ['DOMESTIC', 'EMEA', 'LATAM', 'APAC'];
const COLORS = { DOMESTIC: '#3b82f6', EMEA: '#f59e0b', LATAM: '#10b981', APAC: '#6366f1' };

function parseRegionRows(rows, region) {
  return (rows || [])
    .map((row) => {
      const month = normalizeDateValue(getFieldValue(row, ['Month', 'month', 'Date', 'date', 'Period', 'period']));
      const mau = parseNumber(getFieldValue(row, ['Total Active Accounts', 'Active Accounts', 'active_accounts', 'MAU']));
      const mad = parseNumber(getFieldValue(row, ['Total Active Devices', 'Active Devices', 'active_devices', 'MAD']));
      const hrs = parseNumber(getFieldValue(row, ['Total Playback Hours', 'Playback Hours', 'playback_hours', 'Hours']));
      if (!month || (mau == null && mad == null && hrs == null)) return null;
      return { month, region, mau, mad, hrs };
    })
    .filter(Boolean)
    .sort((left, right) => left.month.localeCompare(right.month));
}

function buildRegionSummary(rowsByRegion) {
  return REGIONS.filter((region) => rowsByRegion[region]?.length).map((region) => {
    const rows = rowsByRegion[region];
    const current = rows[rows.length - 1] || {};
    const previous = rows[rows.length - 2] || {};
    return {
      region,
      month: current.month,
      current,
      previous,
      mauMoM: toPercentChange(current.mau, previous.mau),
      madMoM: toPercentChange(current.mad, previous.mad),
      hrsMoM: toPercentChange(current.hrs, previous.hrs),
    };
  });
}

function validateRegionalUpload(rows, region) {
  if (!rows?.length) {
    throw new Error(`${region} upload is empty.`);
  }

  if (!parseRegionRows(rows, region).length) {
    throw new Error(`Unable to find valid monthly ${region} rows in this Looker export.`);
  }
}

export default function RegionalKpis() {
  const [uploads, setUploads] = useState({});
  const [copied, setCopied] = useState(false);
  const [uploadSources, setUploadSources] = useState({});
  const [importGeneration, setImportGeneration] = useState(0);

  const rowsByRegion = REGIONS.reduce((acc, region) => {
    acc[region] = parseRegionRows(uploads[region] || [], region);
    return acc;
  }, {});

  const summaryRows = buildRegionSummary(rowsByRegion);
  const loaded = summaryRows.map((row) => row.region);
  const allLoaded = REGIONS.every((region) => loaded.includes(region));

  const currentTotals = summaryRows.reduce((acc, row) => ({
    mau: acc.mau + (row.current.mau || 0),
    mad: acc.mad + (row.current.mad || 0),
    hrs: acc.hrs + (row.current.hrs || 0),
  }), { mau: 0, mad: 0, hrs: 0 });

  const previousTotals = summaryRows.reduce((acc, row) => ({
    mau: acc.mau + (row.previous.mau || 0),
    mad: acc.mad + (row.previous.mad || 0),
    hrs: acc.hrs + (row.previous.hrs || 0),
  }), { mau: 0, mad: 0, hrs: 0 });

  const totalChanges = {
    mau: toPercentChange(currentTotals.mau, previousTotals.mau),
    mad: toPercentChange(currentTotals.mad, previousTotals.mad),
    hrs: toPercentChange(currentTotals.hrs, previousTotals.hrs),
  };

  const pieData = summaryRows.map((row) => ({
    name: row.region,
    value: row.current.mau || 0,
    pct: currentTotals.mau ? `${(((row.current.mau || 0) / currentTotals.mau) * 100).toFixed(1)}%` : '0%',
  }));
  const month = summaryRows[0]?.month || new Date().toISOString().slice(0, 7);
  const sourceFiles = Object.values(uploadSources).filter(Boolean);
  const autoSaveRequest = allLoaded && importGeneration
    ? {
        type: 'regionalKpis',
        label: 'Regional KPIs',
        collectionName: 'monthlySnapshots',
        data: {
          type: 'regionalKpis',
          month,
          rowCounts: REGIONS.reduce((counts, region) => {
            counts[region] = uploads[region]?.length || 0;
            return counts;
          }, {}),
          seriesByRegion: rowsByRegion,
          summaryRows,
        },
        fingerprintData: {
          seriesByRegion: rowsByRegion,
          summaryRows,
        },
        sourceFiles,
        summary: {
          month,
          regionCount: summaryRows.length,
        },
      }
    : null;
  const autoSave = useAutoImport(autoSaveRequest, autoSaveRequest ? `regional-kpis-${importGeneration}` : null);

  const setRegionUpload = (region) => (rows, fields, sourceFileName) => {
    validateRegionalUpload(rows, region);
    setUploads((prev) => ({ ...prev, [region]: rows }));
    setUploadSources((prev) => ({ ...prev, [region]: sourceFileName || prev[region] }));
    setImportGeneration((current) => current + 1);
  };

  const generateConfluence = () => {
    if (!summaryRows.length) return '';
    const month = summaryRows[0]?.month ? formatDateLabel(summaryRows[0].month) : '';
    const rows = summaryRows.map((row) => (
      `${row.region}: MAU ${compactNumber(row.current.mau, 2)} (${formatChange(row.mauMoM)}) | MAD ${compactNumber(row.current.mad, 2)} (${formatChange(row.madMoM)}) | Playback Hrs ${compactNumber(row.current.hrs, 2)} (${formatChange(row.hrsMoM)})`
    )).join('\n');

    return `<h3>Regional KPIs — ${month}</h3>
${rows}
TOTAL: MAU ${compactNumber(currentTotals.mau, 2)} (${formatChange(totalChanges.mau)}) | MAD ${compactNumber(currentTotals.mad, 2)} (${formatChange(totalChanges.mad)}) | Hrs ${compactNumber(currentTotals.hrs, 2)} (${formatChange(totalChanges.hrs)})`;
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
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>Regional KPIs</h2>
      </div>

      <div className="instructions">
        <h4>ℹ️ How to get this data</h4>
        <ol>
          <li>Open the <a href="https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust" target="_blank" rel="noreferrer">D+ Device Health & Status Dashboard V2.0</a>.</li>
          <li>Set <strong>Device Family</strong> = rust, <strong>Date Range</strong> = last 1 complete month.</li>
          <li>For each region (APAC, DOMESTIC, EMEA, LATAM), export the CSV and upload it below.</li>
          <li>The app compares the most recent month against the previous month available in each region export.</li>
        </ol>
        <a className="source-link" href="https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust" target="_blank" rel="noreferrer">🔗 Open Looker Dashboard</a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {REGIONS.map((region) => (
          <div key={region} className="card" style={{ marginBottom: 0 }}>
            <div className="flex-between" style={{ marginBottom: 10 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>{region}</div>
              {summaryRows.find((row) => row.region === region) ? <span className="chip chip-green">Loaded</span> : <span className="chip chip-gray">Pending</span>}
            </div>
            <UploadZone label={`Drop ${region} CSV`} onParsed={setRegionUpload(region)} />
            {summaryRows.find((row) => row.region === region) && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#475569' }}>
                {formatDateLabel(summaryRows.find((row) => row.region === region)?.month)} ·
                MAU: <strong>{compactNumber(summaryRows.find((row) => row.region === region)?.current.mau, 2)}</strong> ·
                MAD: <strong>{compactNumber(summaryRows.find((row) => row.region === region)?.current.mad, 2)}</strong> ·
                Hrs: <strong>{compactNumber(summaryRows.find((row) => row.region === region)?.current.hrs, 2)}</strong>
              </div>
            )}
          </div>
        ))}
      </div>

      {summaryRows.length > 0 && (
        <>
          <div className="alert alert-info">
            {allLoaded ? '✅ All 4 regions loaded. Regional KPIs are ready for Confluence.' : `ℹ️ ${loaded.length}/4 regions loaded: ${loaded.join(', ')}`}
          </div>

          {allLoaded && (
            <AutoSaveStatus
              label="Regional KPIs"
              status={autoSave.status}
              error={autoSave.error}
              importedAtMs={autoSave.importedAtMs}
              rollbackUntilMs={autoSave.rollbackUntilMs}
              onRollback={autoSave.rollback}
            />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-title">🌍 MAU by Region</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(entry) => `${entry.name}: ${entry.pct}`} labelLine={false}>
                    {pieData.map((entry) => <Cell key={entry.name} fill={COLORS[entry.name]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => compactNumber(value, 2)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-title">📊 Regional KPI Table</div>
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
                  {summaryRows.map((row) => (
                    <tr key={row.region}>
                      <td style={{ fontWeight: 700 }}>{row.region}</td>
                      <td className="num">{compactNumber(row.current.mau, 2)}</td>
                      <td className={getChangeClass(row.mauMoM)}>{formatChange(row.mauMoM)}</td>
                      <td className="num">{compactNumber(row.current.mad, 2)}</td>
                      <td className={getChangeClass(row.madMoM)}>{formatChange(row.madMoM)}</td>
                      <td className="num">{compactNumber(row.current.hrs, 2)}</td>
                      <td className={getChangeClass(row.hrsMoM)}>{formatChange(row.hrsMoM)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td>TOTAL</td>
                    <td className="num">{compactNumber(currentTotals.mau, 2)}</td>
                    <td className={getChangeClass(totalChanges.mau)}>{formatChange(totalChanges.mau)}</td>
                    <td className="num">{compactNumber(currentTotals.mad, 2)}</td>
                    <td className={getChangeClass(totalChanges.mad)}>{formatChange(totalChanges.mad)}</td>
                    <td className="num">{compactNumber(currentTotals.hrs, 2)}</td>
                    <td className={getChangeClass(totalChanges.hrs)}>{formatChange(totalChanges.hrs)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {allLoaded && (
            <div className="card">
              <div className="card-title">🚀 Confluence Output</div>
              <div className="card-subtitle">Paste into the Regional KPIs section of the monthly page.</div>
              <div className="output-preview">{generateConfluence()}</div>
              <div className="output-actions">
                <button className="btn btn-primary" onClick={copy}>{copied ? '✅ Copied!' : '📋 Copy to Clipboard'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
