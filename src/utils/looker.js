import JSZip from 'jszip';
import Papa from 'papaparse';
import {
  compareDateValues,
  formatDateLabel,
  getFieldValue,
  normalizeDateValue,
  normalizeFieldName,
  parseNumber,
  toPercentChange,
} from './reporting';

const PLATFORM_ALIASES = [
  ['playstation', 'PlayStation'],
  ['ps', 'PlayStation'],
  ['xbox', 'Xbox'],
  ['adk', 'ADK'],
  ['stb', 'ADK'],
];

const REGION_ALIASES = [
  ['domestic', 'DOMESTIC'],
  ['emea', 'EMEA'],
  ['latam', 'LATAM'],
  ['apac', 'APAC'],
];

const METRIC_FIELD_CANDIDATES = {
  mau: ['Total Active Accounts', 'Active Accounts', 'active_accounts', 'MAU'],
  mad: ['Total Active Devices', 'Active Devices', 'active_devices', 'MAD'],
  hrs: ['Total Playback Hours', 'Playback Hours', 'playback_hours', 'Hours'],
};

const DATE_FIELD_CANDIDATES = ['Month', 'month', 'Date', 'date', 'Period', 'period', 'Month Start', 'month_start'];
const PLATFORM_FIELD_CANDIDATES = ['Device Platform', 'Platform', 'platform', 'Partner Device Platform', 'partner_device_platform'];
const REGION_FIELD_CANDIDATES = ['Region', 'region', 'Territory', 'territory', 'Geo', 'geo'];

function detectAlias(rawValue, aliases, fallback = 'Unknown') {
  const value = String(rawValue || '').trim();
  const normalized = normalizeFieldName(value);
  for (const [needle, label] of aliases) {
    if (normalized.includes(normalizeFieldName(needle))) return label;
  }
  return value || fallback;
}

export function identifyMetricTypeFromFilename(filename = '') {
  const normalized = normalizeFieldName(filename);
  if (normalized.includes('activeaccount') || normalized.includes('mau')) return 'mau';
  if (normalized.includes('activedevice') || normalized.includes('mad')) return 'mad';
  if (normalized.includes('playbackhour') || normalized.includes('hours')) return 'hrs';
  return null;
}

function pickMetricValue(row, metricType) {
  const explicit = getFieldValue(row, METRIC_FIELD_CANDIDATES[metricType] || []);
  const parsedExplicit = parseNumber(explicit);
  if (parsedExplicit != null) return parsedExplicit;

  const fields = Object.entries(row || {}).filter(([key]) => {
    const normalized = normalizeFieldName(key);
    return !DATE_FIELD_CANDIDATES.some((candidate) => normalizeFieldName(candidate) === normalized)
      && !PLATFORM_FIELD_CANDIDATES.some((candidate) => normalizeFieldName(candidate) === normalized)
      && !REGION_FIELD_CANDIDATES.some((candidate) => normalizeFieldName(candidate) === normalized);
  });

  for (const [, value] of fields) {
    const parsed = parseNumber(value);
    if (parsed != null) return parsed;
  }

  return null;
}

export function parseLookerMetricRows(rows, metricType, dimension = 'platform') {
  return (rows || [])
    .map((row) => {
      const month = normalizeDateValue(getFieldValue(row, DATE_FIELD_CANDIDATES));
      const entityRaw = getFieldValue(row, dimension === 'region' ? REGION_FIELD_CANDIDATES : PLATFORM_FIELD_CANDIDATES);
      const entity = dimension === 'region'
        ? detectAlias(entityRaw, REGION_ALIASES, '')
        : detectAlias(entityRaw, PLATFORM_ALIASES, '');
      const value = pickMetricValue(row, metricType);

      if (!month || !entity || value == null) return null;
      return { month, entity, value };
    })
    .filter(Boolean)
    .sort((a, b) => compareDateValues(a.month, b.month));
}

export function buildMonthlyDataset(metricRowsByType, dimensionOrder = []) {
  const merged = {};

  Object.entries(metricRowsByType).forEach(([metricType, rows]) => {
    (rows || []).forEach((row) => {
      if (!merged[row.entity]) merged[row.entity] = {};
      if (!merged[row.entity][row.month]) merged[row.entity][row.month] = { month: row.month, entity: row.entity };
      merged[row.entity][row.month][metricType] = row.value;
    });
  });

  const entities = Object.keys(merged)
    .sort((left, right) => {
      const leftIndex = dimensionOrder.indexOf(left);
      const rightIndex = dimensionOrder.indexOf(right);
      if (leftIndex !== -1 || rightIndex !== -1) return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
      return left.localeCompare(right);
    });

  const seriesByEntity = {};
  entities.forEach((entity) => {
    const rows = Object.values(merged[entity])
      .sort((a, b) => compareDateValues(a.month, b.month))
      .map((row) => ({
        ...row,
        hpv: row.mau != null && row.hrs != null ? row.hrs / row.mau : null,
      }));
    seriesByEntity[entity] = rows;
  });

  return seriesByEntity;
}

export function buildSummaryRows(seriesByEntity) {
  return Object.entries(seriesByEntity).map(([entity, rows]) => {
    const current = rows[rows.length - 1] || {};
    const previous = rows[rows.length - 2] || {};
    return {
      entity,
      month: current.month || '',
      current,
      previous,
      mauMoM: toPercentChange(current.mau, previous.mau),
      madMoM: toPercentChange(current.mad, previous.mad),
      hrsMoM: toPercentChange(current.hrs, previous.hrs),
      hpvMoM: toPercentChange(current.hpv, previous.hpv),
    };
  });
}

export function buildTrendData(seriesByEntity, metricKey) {
  const chartMap = {};
  Object.entries(seriesByEntity).forEach(([entity, rows]) => {
    rows.forEach((row) => {
      if (!chartMap[row.month]) {
        chartMap[row.month] = {
          month: row.month,
          label: formatDateLabel(row.month),
        };
      }
      chartMap[row.month][entity] = row[metricKey];
    });
  });

  return Object.values(chartMap).sort((a, b) => compareDateValues(a.month, b.month));
}

export async function parseLookerZip(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parsedFiles = [];

  const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.csv'));
  for (const entry of entries) {
    const content = await entry.async('string');
    const result = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
    });

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    parsedFiles.push({
      name: entry.name.split('/').pop(),
      rows: result.data,
      metricType: identifyMetricTypeFromFilename(entry.name),
    });
  }

  return parsedFiles;
}
