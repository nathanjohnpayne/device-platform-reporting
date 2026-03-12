import React from 'react';

const SOURCES = {
  looker: {
    label: 'Looker (Platform & Regional KPIs)',
    dashboardUrl: 'https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust',
    dashboardLabel: 'D+ Device Health & Status Dashboard V2.0',
    pageUrl: '#/platform-kpis',
    pageLabel: 'Platform & Regional KPIs page',
  },
  'conviva-adk': {
    label: 'Conviva (ADK Version Share)',
    dashboardUrl: 'https://pulse.conviva.com/app/custom-dashboards/dashboard/28764?data-source=ei',
    dashboardLabel: 'NCP+ADK: ADK Version Comparisons (D+)',
    pageUrl: '#/adk-version-share',
    pageLabel: 'ADK Version Share page',
  },
  sentry: {
    label: 'Sentry (Partner Migration)',
    dashboardUrl: 'https://disney.my.sentry.io/organizations/disney/explore/discover/results/?field=partner&field=device&field=core_version&field=count_unique%28device_id%29&field=count%28%29&sort=-count_unique_device_id&statsPeriod=24h',
    dashboardLabel: 'ADK Partner–Device Combinations',
    pageUrl: '#/partner-migration',
    pageLabel: 'Partner Migration page',
  },
};

function LookerSteps({ missingPeriod }) {
  const src = SOURCES.looker;
  return (
    <ol style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.7 }}>
      <li>Open the <a href={src.dashboardUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{src.dashboardLabel}</a>.</li>
      <li>Set <strong>Date Range</strong> → "is in the last 1 complete months," then step back one month using the date picker until <strong>{missingPeriod}</strong> is selected.</li>
      <li>Set <strong>Device Family</strong> → <code>rust</code>.</li>
      <li>For Regional KPIs, set <strong>Region</strong> to each of: APAC, DOMESTIC, EMEA, LATAM in turn.</li>
      <li>Download the CSV zip and upload it on the <a href={src.pageUrl} style={{ fontWeight: 600 }}>{src.pageLabel}</a>.</li>
    </ol>
  );
}

function ConvivaAdkSteps({ missingPeriod }) {
  const src = SOURCES['conviva-adk'];
  return (
    <ol style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.7 }}>
      <li>Open <a href={src.dashboardUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{src.dashboardLabel}</a>.</li>
      <li>Set the date range to the 30-day window ending on <strong>{missingPeriod}</strong>.</li>
      <li>Export the CSV and upload it on the <a href={src.pageUrl} style={{ fontWeight: 600 }}>{src.pageLabel}</a>.</li>
    </ol>
  );
}

function SentrySteps({ missingPeriod }) {
  const src = SOURCES.sentry;
  return (
    <ol style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.7 }}>
      <li>Open the <a href={src.dashboardUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{src.dashboardLabel}</a>.</li>
      <li>Adjust <code>statsPeriod</code> in the URL to cover the missing week (e.g., <code>statsPeriod=7d</code>) and set the date range to end on <strong>{missingPeriod}</strong>.</li>
      <li>Export the tabular CSV and upload it on the <a href={src.pageUrl} style={{ fontWeight: 600 }}>{src.pageLabel}</a>.</li>
    </ol>
  );
}

export default function MissingDataGuidance({ source, missingPeriod, onDismiss }) {
  const meta = SOURCES[source];
  if (!meta || !missingPeriod) return null;

  return (
    <div className="alert alert-warning" style={{ position: 'relative', paddingRight: 36 }}>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          color: '#92400e',
          lineHeight: 1,
        }}
      >
        ×
      </button>
      <strong>⚠️ Prior-period data needed for MoM comparison</strong>
      <p style={{ margin: '6px 0 2px' }}>
        <strong>{missingPeriod}</strong> {meta.label} data is needed to calculate month-over-month changes. Without it, MoM delta fields will be blank.
      </p>
      <strong style={{ fontSize: 13 }}>How to import the missing data:</strong>
      {source === 'looker' && <LookerSteps missingPeriod={missingPeriod} />}
      {source === 'conviva-adk' && <ConvivaAdkSteps missingPeriod={missingPeriod} />}
      {source === 'sentry' && <SentrySteps missingPeriod={missingPeriod} />}
    </div>
  );
}
