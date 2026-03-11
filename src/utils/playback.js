import {
  classifyMetric,
  compareDateValues,
  compactNumber,
  formatChange,
  formatDateLabel,
  formatPercent,
  guessDateKey,
  humanizeMetric,
  normalizeDateValue,
  parseNumber,
  toPercentChange,
} from './reporting';

export const METRIC_ORDER = ['attempts', 'uniqueDevices', 'vsf', 'vpf'];
export const FALLBACK_COLORS = ['#3b82f6', '#1e3a8a', '#f59e0b', '#7c3aed', '#ec4899', '#10b981', '#14b8a6', '#f97316'];

export function formatSeriesLabel(key) {
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

export function formatMetricValue(metric, value) {
  if (value == null) return '—';
  if (metric === 'vsf' || metric === 'vpf') return formatPercent(value, 2);
  return compactNumber(value, 1);
}

export function metricFormatter(metric, value) {
  return metric === 'vsf' || metric === 'vpf' ? formatPercent(value, 2) : compactNumber(value, 1);
}

export function buildPlaybackAnalysis(rows, config) {
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
        return { metric, label: series.label, change, current, prior };
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

export function generatePlaybackText(analysis) {
  if (!analysis.narrative.length) return '';
  const narrativeLines = analysis.narrative.map((line) => `  • ${line}`).join('\n');
  const sections = METRIC_ORDER
    .filter((metric) => analysis.metricSeries[metric]?.length)
    .map((metric) => {
      const lines = analysis.metricSeries[metric]
        .map((series) => `  • ${series.label}: ${formatMetricValue(metric, analysis.chartData[analysis.chartData.length - 1]?.[series.key])}`)
        .join('\n');
      return `${humanizeMetric(metric)} (${analysis.latestLabel})\n${lines}`;
    })
    .join('\n\n');

  return `PLAYBACK PERFORMANCE (LAST 30 DAYS)\nLatest data point: ${analysis.latestLabel}\n\n${narrativeLines}\n\n${sections}`;
}

export function generatePlaybackMarkdown(analysis) {
  if (!analysis.narrative.length) return '';
  const narrativeLines = analysis.narrative.map((line) => `- ${line}`).join('\n');
  const sections = METRIC_ORDER
    .filter((metric) => analysis.metricSeries[metric]?.length)
    .map((metric) => {
      const lines = analysis.metricSeries[metric]
        .map((series) => `- ${series.label}: **${formatMetricValue(metric, analysis.chartData[analysis.chartData.length - 1]?.[series.key])}**`)
        .join('\n');
      return `#### ${humanizeMetric(metric)} (${analysis.latestLabel})\n${lines}`;
    })
    .join('\n\n');

  return `### Playback Performance (Last 30 Days)\n\nLatest data point: ${analysis.latestLabel}\n\n${narrativeLines}\n\n${sections}`;
}
