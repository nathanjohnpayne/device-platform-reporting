import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { resolveAdkVersionLabel } from './adk';
import {
  compareDateValues,
  formatPercent,
  formatDateLabel,
  normalizeDateValue,
  normalizeFieldName,
  parseNumber,
  safePercent,
  toPercentChange,
} from './reporting';

export const LEGACY_WORKBOOK_TYPES = {
  program: 'programKpis',
  burnDown: 'adkBurnDown',
};

export const PROGRAM_WORKBOOK_SHEETS = [
  'Active Users',
  'Active Devices',
  'Total Playback Hours',
  'Hours per Active',
  'ADK Version Share',
  'Regional KPIs',
  'Playback Hours (Data) (2)',
];

const PROGRAM_SHEET_TITLES = {
  activeUsers: 'Active Users',
  activeDevices: 'Active Devices',
  playbackHours: 'Total Playback Hours',
  hoursPerActive: 'Hours per Active',
  adkVersionShare: 'ADK Version Share',
  regionalKpis: 'Regional KPIs',
  playbackHoursData: 'Playback Hours (Data) (2)',
};

const PLATFORM_SUMMARY_HEADERS = {
  activeUsers: {
    dateLabel: 'Month',
    metricLabel: 'Total Monthly Active Users',
    totalLabel: 'Total - NCP+ADK',
    changeLabel: 'NCP+ADK YoY%',
    psTotalLabel: 'Total - PS',
    psChangeLabel: 'PS YoY %',
    xboxTotalLabel: 'Total - Xbox',
    xboxChangeLabel: 'Xbox YoY %',
    adkTotalLabel: 'Total - ADK',
    adkChangeLabel: 'ADK YoY %',
  },
  activeDevices: {
    dateLabel: 'Date Month',
    metricLabel: 'Total Monthly Active Devices',
    totalLabel: 'Total - NCP+ADK',
    changeLabel: 'NCP+ADK YoY%',
    psTotalLabel: 'Total - PS',
    psChangeLabel: 'PS YoY %',
    xboxTotalLabel: 'Total - Xbox',
    xboxChangeLabel: 'Xbox YoY %',
    adkTotalLabel: 'Total - ADK',
    adkChangeLabel: 'ADK YoY %',
  },
  playbackHours: {
    dateLabel: 'Date Month',
    metricLabel: 'Total Playback Hours',
    totalLabel: 'Total - NCP+ADK',
    changeLabel: 'NCP+ADK YoY%',
    psTotalLabel: 'Total - PS',
    psChangeLabel: 'PS YoY %',
    xboxTotalLabel: 'Total - Xbox',
    xboxChangeLabel: 'Xbox YoY %',
    adkTotalLabel: 'Total - ADK',
    adkChangeLabel: 'ADK YoY %',
  },
};

const REGIONS = ['APAC', 'DOMESTIC', 'EMEA', 'LATAM'];
const MAX_WORKBOOK_SIZE_BYTES = 50 * 1024 * 1024;
const REGIONAL_HEADER_LABELS = {
  totals: {
    mau: 'Active Accounts: Total',
    mad: 'Active Devices: Total',
    hrs: 'Playback Hours: Total',
  },
  regions: {
    APAC: {
      mau: 'Active Accounts: APAC',
      mad: 'Active Devices: APAC',
      hrs: 'Playback Hours: APAC',
    },
    DOMESTIC: {
      mau: 'Active Accounts: Domestic',
      mad: 'Active Devices: Domestic',
      hrs: 'Playback Hours: Domestic',
    },
    EMEA: {
      mau: 'Active Accounts: EMEA',
      mad: 'Active Devices: EMEA',
      hrs: 'Playback Hours: EMEA',
    },
    LATAM: {
      mau: 'Active Accounts: LATAM',
      mad: 'Active Devices: LATAM',
      hrs: 'Playback Hours: LATAM',
    },
  },
};

function trimTrailingEmptyCells(row = []) {
  const next = [...row];
  while (next.length && String(next[next.length - 1] || '').trim() === '') next.pop();
  return next;
}

function trimTrailingBlankRows(rows = []) {
  const next = rows.map(trimTrailingEmptyCells);
  while (next.length && !next[next.length - 1].some((value) => String(value || '').trim() !== '')) next.pop();
  return next;
}

function workbookTypeLabel(workbookType) {
  return workbookType === LEGACY_WORKBOOK_TYPES.program ? 'Program Weekly KPIs' : 'ADK Adoption Burn Down';
}

export function isProgramWorkbookSheetSet(sheetNames = []) {
  return PROGRAM_WORKBOOK_SHEETS.every((name) => sheetNames.includes(name));
}

export function isBurnDownWorkbookSheetSet(sheets = []) {
  return (sheets || []).some((sheet) => (
    (sheet.rows || []).some((row = []) => row.some((value) => String(value || '').trim() !== ''))
  ));
}

export async function readWorkbookFile(file) {
  if (file.size > MAX_WORKBOOK_SIZE_BYTES) {
    throw new Error('Workbook is larger than 50MB. Export a smaller file before importing it into the app.');
  }

  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: true,
    raw: false,
  });

  return {
    name: file.name,
    sheetNames: workbook.SheetNames,
    sheets: workbook.SheetNames.map((sheetName, index) => ({
      sheetName,
      sheetOrder: index,
      rows: trimTrailingBlankRows(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: false,
      })),
    })),
  };
}

export function rowsToCsvText(rows = []) {
  return Papa.unparse(rows, {
    header: false,
    quotes: true,
    skipEmptyLines: false,
  });
}

export function csvTextToRows(csvText = '') {
  const parsed = Papa.parse(csvText, {
    skipEmptyLines: false,
  });
  return trimTrailingBlankRows(parsed.data || []);
}

function formatInteger(value) {
  const numeric = parseNumber(value);
  return numeric == null ? '' : Math.round(numeric).toLocaleString('en-US');
}

function formatDecimal(value, digits = 1) {
  const numeric = parseNumber(value);
  return numeric == null ? '' : numeric.toFixed(digits);
}

function formatWorkbookPercent(value, digits = 2) {
  const numeric = parseNumber(value);
  return numeric == null ? '' : `${numeric.toFixed(digits)}%`;
}

function safeDivide(numerator, denominator) {
  const left = parseNumber(numerator);
  const right = parseNumber(denominator);
  if (left == null || right == null || right === 0) return null;
  return left / right;
}

function monthKey(value) {
  return normalizeDateValue(value).slice(0, 7);
}

function parseWorkbookDate(value) {
  const normalized = normalizeDateValue(value);
  return /^\d{4}-\d{2}(?:-\d{2})?$/.test(normalized) ? normalized : '';
}

function monthToDateString(value) {
  const normalized = monthKey(value);
  return normalized ? `${normalized}-01` : '';
}

function sortMonths(values = []) {
  return [...values].sort((left, right) => compareDateValues(monthToDateString(left), monthToDateString(right)));
}

function humanizePartnerLabel(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(ps4|ps5|kpn|nos|sfr|xbox)$/i.test(raw)) return raw.toUpperCase();
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildPartnerHeaders(importedProgramSheets = {}) {
  const playbackDataRows = importedProgramSheets[PROGRAM_SHEET_TITLES.playbackHoursData] || [];
  const importedPartnerLabels = playbackDataRows[0]?.slice(1).filter(Boolean) || [];

  if (importedPartnerLabels.length) {
    return importedPartnerLabels.map((label) => ({
      label: humanizePartnerLabel(label),
      key: normalizeFieldName(label),
    }));
  }

  const activeUserRows = importedProgramSheets[PROGRAM_SHEET_TITLES.activeUsers] || [];
  const fallbackLabels = activeUserRows[0]?.slice(9).map((label, index) => label || `Column ${index + 1}`).filter(Boolean) || [];
  return fallbackLabels.map((label) => ({
    label: humanizePartnerLabel(label),
    key: normalizeFieldName(label),
  }));
}

function metricRowToValueMap(row = {}) {
  const entries = {};
  Object.entries(row).forEach(([key, value]) => {
    if (!key) return;
    const normalizedKey = normalizeFieldName(key);
    if (!normalizedKey || normalizedKey === 'deviceplatform' || normalizedKey === 'viewgranularity' || normalizedKey === 'date') return;
    const numeric = parseNumber(value);
    if (numeric != null) entries[normalizedKey] = numeric;
  });
  return entries;
}

function firstMetricDataRow(rows = []) {
  return (rows || []).find((row) => {
    const firstKey = Object.keys(row || {})[0];
    return firstKey && parseWorkbookDate(row[firstKey]);
  });
}

export function buildLegacyPlatformSnapshot(uploads = {}) {
  const activeUsersRow = firstMetricDataRow(uploads.mau || []);
  const activeDevicesRow = firstMetricDataRow(uploads.mad || []);
  const playbackHoursRow = firstMetricDataRow(uploads.hrs || []);

  if (!activeUsersRow || !activeDevicesRow || !playbackHoursRow) return null;

  const dateKey = Object.keys(activeUsersRow)[0];
  const date = parseWorkbookDate(activeUsersRow[dateKey]);

  return {
    month: monthKey(date),
    activeUsers: {
      date,
      values: metricRowToValueMap(activeUsersRow),
    },
    activeDevices: {
      date: parseWorkbookDate(activeDevicesRow[Object.keys(activeDevicesRow)[0]]),
      values: metricRowToValueMap(activeDevicesRow),
    },
    playbackHours: {
      date: parseWorkbookDate(playbackHoursRow[Object.keys(playbackHoursRow)[0]]),
      values: metricRowToValueMap(playbackHoursRow),
    },
  };
}

function parseImportedMetricSheet(rows = [], partnerHeaders = []) {
  return (rows || [])
    .slice(2)
    .map((row) => {
      const month = monthKey(row[0]);
      if (!month) return null;

      const values = {};
      partnerHeaders.forEach((partner, index) => {
        const numeric = parseNumber(row[index + 9]);
        if (numeric != null) values[partner.key] = numeric;
      });

      if (!Object.keys(values).length) return null;
      return { month, values };
    })
    .filter(Boolean);
}

function parseImportedPlaybackHoursData(rows = [], partnerHeaders = []) {
  return (rows || [])
    .slice(2)
    .map((row) => {
      const date = normalizeDateValue(row[0]);
      if (!date) return null;

      const values = {};
      partnerHeaders.forEach((partner, index) => {
        const numeric = parseNumber(row[index + 1]);
        if (numeric != null) values[partner.key] = numeric;
      });

      if (!Object.keys(values).length) return null;
      return { date, month: monthKey(date), values };
    })
    .filter(Boolean);
}

function parseImportedRegionalRows(rows = []) {
  const headerRow = rows[0] || [];
  const indexFor = (label) => headerRow.findIndex((value) => value === label);

  return (rows || [])
    .slice(1)
    .map((row) => {
      const month = monthKey(row[0]);
      if (!month) return null;

      const totals = {
        mau: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.totals.mau)]),
        mad: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.totals.mad)]),
        hrs: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.totals.hrs)]),
      };

      const regions = {
        APAC: {
          mau: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.APAC.mau)]),
          mad: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.APAC.mad)]),
          hrs: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.APAC.hrs)]),
        },
        DOMESTIC: {
          mau: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.DOMESTIC.mau)]),
          mad: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.DOMESTIC.mad)]),
          hrs: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.DOMESTIC.hrs)]),
        },
        EMEA: {
          mau: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.EMEA.mau)]),
          mad: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.EMEA.mad)]),
          hrs: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.EMEA.hrs)]),
        },
        LATAM: {
          mau: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.LATAM.mau)]),
          mad: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.LATAM.mad)]),
          hrs: parseNumber(row[indexFor(REGIONAL_HEADER_LABELS.regions.LATAM.hrs)]),
        },
      };

      if (totals.mau == null && totals.mad == null && totals.hrs == null) return null;
      return { month, totals, regions };
    })
    .filter(Boolean);
}

function parseImportedAdkShareRows(rows = []) {
  const versions = (rows[0] || []).slice(2).filter(Boolean);

  return (rows || [])
    .slice(1)
    .map((row) => {
      const date = normalizeDateValue(row[0]);
      const total = parseNumber(row[1]);
      if (!date || total == null || total < 100) return null;

      const counts = {};
      versions.forEach((version, index) => {
        const numeric = parseNumber(row[index + 2]);
        if (numeric != null) counts[version] = numeric;
      });

      return { date, counts, total };
    })
    .filter(Boolean);
}

function dedupeByKey(entries = [], getKey) {
  const map = new Map();
  entries.forEach((entry) => {
    if (!entry) return;
    map.set(getKey(entry), entry);
  });
  return [...map.values()];
}

function derivePlatformTotals(values = {}) {
  const totals = {
    total: 0,
    ps: 0,
    xbox: 0,
  };

  Object.entries(values || {}).forEach(([key, value]) => {
    const numeric = parseNumber(value) || 0;
    totals.total += numeric;
    if (key === 'ps4' || key === 'ps5' || key === 'playstation') totals.ps += numeric;
    if (key === 'xbox') totals.xbox += numeric;
  });

  return {
    ...totals,
    adk: totals.total - totals.ps - totals.xbox,
  };
}

function buildMetricSheetRows(metricKey, partnerHeaders, entries = []) {
  const headers = PLATFORM_SUMMARY_HEADERS[metricKey];
  const sortedEntries = sortMonths(entries.map((entry) => entry.month)).map((month) => entries.find((entry) => entry.month === month));
  const rowsByMonth = new Map(sortedEntries.map((entry) => [entry.month, entry]));

  const builtRows = sortedEntries.map((entry) => {
    const priorYear = rowsByMonth.get(String(Number(entry.month.slice(0, 4)) - 1).padStart(4, '0') + entry.month.slice(4));
    const totals = derivePlatformTotals(entry.values);
    const priorTotals = priorYear ? derivePlatformTotals(priorYear.values) : null;

    return [
      entry.month,
      formatInteger(totals.total),
      formatWorkbookPercent(toPercentChange(totals.total, priorTotals?.total)),
      formatInteger(totals.ps),
      formatWorkbookPercent(toPercentChange(totals.ps, priorTotals?.ps)),
      formatInteger(totals.xbox),
      formatWorkbookPercent(toPercentChange(totals.xbox, priorTotals?.xbox)),
      formatInteger(totals.adk),
      formatWorkbookPercent(toPercentChange(totals.adk, priorTotals?.adk)),
      ...partnerHeaders.map((partner) => formatInteger(entry.values[partner.key])),
    ];
  });

  return [
    ['Device Platform', '', '', '', '', '', '', '', '', ...partnerHeaders.map((partner) => partner.label)],
    [
      headers.dateLabel,
      headers.totalLabel,
      headers.changeLabel,
      headers.psTotalLabel,
      headers.psChangeLabel,
      headers.xboxTotalLabel,
      headers.xboxChangeLabel,
      headers.adkTotalLabel,
      headers.adkChangeLabel,
      ...partnerHeaders.map(() => headers.metricLabel),
    ],
    ...builtRows,
  ];
}

function buildPlaybackHoursDataRows(partnerHeaders, entries = []) {
  const sorted = [...entries].sort((left, right) => compareDateValues(right.date, left.date));
  return [
    ['Device Platform', ...partnerHeaders.map((partner) => partner.label)],
    ['Date', ...partnerHeaders.map(() => 'Total Playback Hours')],
    ...sorted.map((entry) => [
      entry.date,
      ...partnerHeaders.map((partner) => formatInteger(entry.values[partner.key])),
    ]),
  ];
}

function buildHoursPerActiveRows(activeUserEntries = [], playbackEntries = []) {
  const activeUserMap = new Map(activeUserEntries.map((entry) => [entry.month, entry]));
  const playbackMap = new Map(playbackEntries.map((entry) => [entry.month, entry]));
  const months = sortMonths([...new Set([...activeUserMap.keys(), ...playbackMap.keys()])]);

  const built = months.map((month, index) => {
    const activeUsers = activeUserMap.get(month);
    const playback = playbackMap.get(month);
    if (!activeUsers || !playback) return null;

    const activeTotals = derivePlatformTotals(activeUsers.values);
    const playbackTotals = derivePlatformTotals(playback.values);
    const hpa = {
      total: safeDivide(playbackTotals.total, activeTotals.total),
      ps: safeDivide(playbackTotals.ps, activeTotals.ps),
      xbox: safeDivide(playbackTotals.xbox, activeTotals.xbox),
      adk: safeDivide(playbackTotals.adk, activeTotals.adk),
    };

    const priorMonth = index > 0 ? months[index - 1] : null;
    const priorActiveUsers = priorMonth ? activeUserMap.get(priorMonth) : null;
    const priorPlayback = priorMonth ? playbackMap.get(priorMonth) : null;
    const priorActiveTotals = priorActiveUsers ? derivePlatformTotals(priorActiveUsers.values) : null;
    const priorPlaybackTotals = priorPlayback ? derivePlatformTotals(priorPlayback.values) : null;
    const priorHpa = priorActiveTotals && priorPlaybackTotals ? {
      total: safeDivide(priorPlaybackTotals.total, priorActiveTotals.total),
      ps: safeDivide(priorPlaybackTotals.ps, priorActiveTotals.ps),
      xbox: safeDivide(priorPlaybackTotals.xbox, priorActiveTotals.xbox),
      adk: safeDivide(priorPlaybackTotals.adk, priorActiveTotals.adk),
    } : null;

    // The legacy sheet only has MoM columns for PS, Xbox, and ADK. Total HPA is displayed without a paired MoM column.
    return [
      month,
      formatInteger(playbackTotals.total),
      formatInteger(activeTotals.total),
      formatDecimal(hpa.total, 1),
      formatInteger(playbackTotals.ps),
      formatInteger(activeTotals.ps),
      formatDecimal(hpa.ps, 1),
      formatWorkbookPercent(toPercentChange(hpa.ps, priorHpa?.ps)),
      formatInteger(playbackTotals.xbox),
      formatInteger(activeTotals.xbox),
      formatDecimal(hpa.xbox, 1),
      formatWorkbookPercent(toPercentChange(hpa.xbox, priorHpa?.xbox)),
      formatInteger(playbackTotals.adk),
      formatInteger(activeTotals.adk),
      formatDecimal(hpa.adk, 1),
      formatWorkbookPercent(toPercentChange(hpa.adk, priorHpa?.adk)),
    ];
  }).filter(Boolean);

  return [
    ['Date Month', 'Hours - NCP+ADK', 'Actives - NCP+ADK', 'HPA - NCP+ADK', 'Hours - PS', 'Actives - PS', 'HPA - PS', 'MoM', 'Hours - Xbox', 'Actives - Xbox', 'HPA - Xbox', 'MoM', 'Hours - ADK', 'Actives - ADK', 'HPA - ADK', 'MoM'],
    ...built,
  ];
}

function buildRegionalSheetRows(entries = []) {
  const sorted = sortMonths(entries.map((entry) => entry.month)).map((month) => entries.find((entry) => entry.month === month));

  const dataRows = sorted.map((entry, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const row = [
      entry.month,
      formatInteger(entry.totals.mau),
      formatWorkbookPercent(toPercentChange(entry.totals.mau, previous?.totals?.mau)),
      formatInteger(entry.totals.mad),
      formatWorkbookPercent(toPercentChange(entry.totals.mad, previous?.totals?.mad)),
      formatInteger(entry.totals.hrs),
      formatWorkbookPercent(toPercentChange(entry.totals.hrs, previous?.totals?.hrs)),
    ];

    REGIONS.forEach((region) => {
      const current = entry.regions[region] || {};
      const prior = previous?.regions?.[region] || {};
      row.push(
        formatInteger(current.mau),
        formatWorkbookPercent(toPercentChange(current.mau, prior.mau)),
        formatPercent(safePercent(current.mau, entry.totals.mau), 2),
        formatInteger(current.mad),
        formatWorkbookPercent(toPercentChange(current.mad, prior.mad)),
        formatPercent(safePercent(current.mad, entry.totals.mad), 2),
        formatInteger(current.hrs),
        formatWorkbookPercent(toPercentChange(current.hrs, prior.hrs)),
        formatPercent(safePercent(current.hrs, entry.totals.hrs), 2),
      );
    });

    return row;
  });

  return [
    [
      'Date Month',
      'Active Accounts: Total',
      'MoM',
      'Active Devices: Total',
      'MoM',
      'Playback Hours: Total',
      'MoM',
      'Active Accounts: APAC',
      'MoM',
      '% Total',
      'Active Devices: APAC',
      'MoM',
      '% Total',
      'Playback Hours: APAC',
      'MoM',
      '% Total',
      'Active Accounts: Domestic',
      'MoM',
      '% Total',
      'Active Devices: Domestic',
      'MoM',
      '% Total',
      'Playback Hours: Domestic',
      'MoM',
      '% Total',
      'Active Accounts: EMEA',
      'MoM',
      '% Total',
      'Active Devices: EMEA',
      'MoM',
      '% Total',
      'Playback Hours: EMEA',
      'MoM',
      '% Total',
      'Active Accounts: LATAM',
      'MoM',
      '% Total',
      'Active Devices: LATAM',
      'MoM',
      '% Total',
      'Playback Hours: LATAM',
      'MoM',
      '% Total',
    ],
    ...dataRows,
  ];
}

function buildAdkVersionShareRows(importedEntries = [], savedEntries = []) {
  const importedVersions = [...new Set(importedEntries.flatMap((entry) => Object.keys(entry.counts || {})))];
  const savedVersions = [...new Set(savedEntries.flatMap((entry) => (entry.shares || []).map((share) => share.name)))];
  const versions = [...new Set([...importedVersions, ...savedVersions])];

  const mergedEntries = dedupeByKey([
    ...importedEntries.map((entry) => ({
      date: entry.date,
      total: entry.total,
      counts: entry.counts,
    })),
    ...savedEntries.map((entry) => ({
      date: normalizeDateValue(entry.weekOf || entry.latestLabel),
      total: (entry.shares || []).reduce((sum, share) => sum + (parseNumber(share.value) || 0), 0),
      counts: Object.fromEntries((entry.shares || []).map((share) => [share.name, parseNumber(share.value) || 0])),
      latestShares: entry.shares || [],
    })),
  ], (entry) => entry.date).sort((left, right) => compareDateValues(left.date, right.date));

  const latest = mergedEntries[mergedEntries.length - 1];
  const latestShares = latest?.latestShares || versions.map((version) => ({
    name: version,
    value: latest?.counts?.[version] || 0,
    pct: formatPercent(safePercent(latest?.counts?.[version], latest?.total), 1),
  }));

  return [
    ['Date', 'All', ...versions],
    ...mergedEntries.map((entry) => [
      entry.date,
      formatInteger(entry.total),
      ...versions.map((version) => formatInteger(entry.counts?.[version])),
    ]),
    [],
    ['Version', 'Count', 'Percent'],
    ...latestShares.map((share) => [share.name, formatInteger(share.value), share.pct || formatPercent(safePercent(share.value, latest?.total), 1)]),
  ];
}

function buildRegionalExportEntries(snapshotDocs = []) {
  return snapshotDocs
    .map((snapshot) => {
      const summaryRows = snapshot.summaryRows || [];
      if (!summaryRows.length) return null;

      const totals = summaryRows.reduce((acc, row) => ({
        mau: acc.mau + (parseNumber(row.current?.mau) || 0),
        mad: acc.mad + (parseNumber(row.current?.mad) || 0),
        hrs: acc.hrs + (parseNumber(row.current?.hrs) || 0),
      }), { mau: 0, mad: 0, hrs: 0 });

      const regions = Object.fromEntries(REGIONS.map((region) => {
        const row = summaryRows.find((item) => item.region === region);
        return [region, {
          mau: parseNumber(row?.current?.mau) || 0,
          mad: parseNumber(row?.current?.mad) || 0,
          hrs: parseNumber(row?.current?.hrs) || 0,
        }];
      }));

      return {
        month: monthKey(snapshot.month || summaryRows[0]?.month),
        totals,
        regions,
      };
    })
    .filter((entry) => entry?.month);
}

function buildPlatformExportEntries(snapshotDocs = [], metricKey) {
  return snapshotDocs
    .map((snapshot) => snapshot.legacyWorkbook?.platform?.[metricKey])
    .filter(Boolean)
    .map((entry) => ({
      month: monthKey(entry.date || entry.month),
      date: normalizeDateValue(entry.date || monthToDateString(entry.month)),
      values: entry.values || {},
    }))
    .filter((entry) => entry.month);
}

function buildProgramWorkbookSheets(importedProgramSheets = {}, monthlySnapshots = [], shareSnapshots = []) {
  let partnerHeaders = buildPartnerHeaders(importedProgramSheets);

  const importedActiveUsers = parseImportedMetricSheet(importedProgramSheets[PROGRAM_SHEET_TITLES.activeUsers], partnerHeaders);
  const importedActiveDevices = parseImportedMetricSheet(importedProgramSheets[PROGRAM_SHEET_TITLES.activeDevices], partnerHeaders);
  const importedPlaybackHours = parseImportedMetricSheet(importedProgramSheets[PROGRAM_SHEET_TITLES.playbackHours], partnerHeaders);
  const importedPlaybackHoursData = parseImportedPlaybackHoursData(importedProgramSheets[PROGRAM_SHEET_TITLES.playbackHoursData], partnerHeaders);
  const importedRegional = parseImportedRegionalRows(importedProgramSheets[PROGRAM_SHEET_TITLES.regionalKpis]);
  const importedAdkShares = parseImportedAdkShareRows(importedProgramSheets[PROGRAM_SHEET_TITLES.adkVersionShare]);

  const platformSnapshots = monthlySnapshots.filter((snapshot) => snapshot.type === 'platformKpis');
  const regionalSnapshots = monthlySnapshots.filter((snapshot) => snapshot.type === 'regionalKpis');

  const activeUsers = dedupeByKey([
    ...importedActiveUsers,
    ...buildPlatformExportEntries(platformSnapshots, 'activeUsers'),
  ], (entry) => entry.month);

  const activeDevices = dedupeByKey([
    ...importedActiveDevices,
    ...buildPlatformExportEntries(platformSnapshots, 'activeDevices'),
  ], (entry) => entry.month);

  const playbackHours = dedupeByKey([
    ...importedPlaybackHours,
    ...buildPlatformExportEntries(platformSnapshots, 'playbackHours'),
  ], (entry) => entry.month);

  const playbackHoursData = dedupeByKey([
    ...importedPlaybackHoursData,
    ...buildPlatformExportEntries(platformSnapshots, 'playbackHours'),
  ], (entry) => entry.date);

  if (!partnerHeaders.length) {
    const derivedKeys = [...new Set(
      [...activeUsers, ...activeDevices, ...playbackHours]
        .flatMap((entry) => Object.keys(entry.values || {}))
    )].sort((left, right) => humanizePartnerLabel(left).localeCompare(humanizePartnerLabel(right)));
    partnerHeaders = derivedKeys.map((key) => ({
      key,
      label: humanizePartnerLabel(key),
    }));
  }

  const regionalRows = dedupeByKey([
    ...importedRegional,
    ...buildRegionalExportEntries(regionalSnapshots),
  ], (entry) => entry.month);

  return {
    [PROGRAM_SHEET_TITLES.activeUsers]: buildMetricSheetRows('activeUsers', partnerHeaders, activeUsers),
    [PROGRAM_SHEET_TITLES.activeDevices]: buildMetricSheetRows('activeDevices', partnerHeaders, activeDevices),
    [PROGRAM_SHEET_TITLES.playbackHours]: buildMetricSheetRows('playbackHours', partnerHeaders, playbackHours),
    [PROGRAM_SHEET_TITLES.hoursPerActive]: buildHoursPerActiveRows(activeUsers, playbackHours),
    [PROGRAM_SHEET_TITLES.adkVersionShare]: buildAdkVersionShareRows(importedAdkShares, shareSnapshots),
    [PROGRAM_SHEET_TITLES.regionalKpis]: buildRegionalSheetRows(regionalRows),
    [PROGRAM_SHEET_TITLES.playbackHoursData]: buildPlaybackHoursDataRows(partnerHeaders, playbackHoursData),
  };
}

function sheetNameFromPartnerSnapshot(snapshot = {}) {
  const rawName = String(snapshot.sourceFileName || '').replace(/\.csv$/i, '').trim();
  if (rawName) return rawName;

  const formattedDate = formatDateLabel(snapshot.weekOf || new Date().toISOString().slice(0, 10)).replace(/,/g, '').replace(/\s+/g, '-');
  return `Discover_${formattedDate}`;
}

function buildPartnerSheetRows(snapshot = {}, adkMap = {}) {
  const rawRows = snapshot.rawRows || [];
  if (!rawRows.length) return null;

  const rawHeaders = snapshot.rawHeaders?.length ? snapshot.rawHeaders : Object.keys(rawRows[0] || {});
  const normalizedHeaders = rawHeaders.map((header) => normalizeFieldName(header));
  const hasRegion = normalizedHeaders.includes('region');
  const hasAdkVersion = normalizedHeaders.includes('adkversion');
  const headers = [];

  rawHeaders.forEach((header) => {
    const normalized = normalizeFieldName(header);
    headers.push(header);
    if (!hasAdkVersion && normalized === (hasRegion ? 'region' : 'device')) headers.push('ADK Version');
  });

  if (!hasAdkVersion && !headers.includes('ADK Version')) headers.splice(2, 0, 'ADK Version');

  return [
    headers,
    ...rawRows.map((row) => headers.map((header) => {
      if (header === 'ADK Version') return resolveAdkVersionLabel(row.core_version || row['core_version'], adkMap);
      return row[header] ?? '';
    })),
  ];
}

function parseSheetDateFromName(name = '') {
  const match = name.match(/Discover_(\d{4})-([A-Za-z]+)-(\d{2})/i);
  if (!match) return '';
  const [, year, monthName, day] = match;
  return normalizeDateValue(`${monthName} ${Number(day)}, ${year}`);
}

function buildBurnDownSheets(importedSheets = [], partnerSnapshots = [], adkMap = {}) {
  const orderedSheets = importedSheets.map((sheet) => ({
    sheetName: sheet.sheetName,
    sheetOrder: sheet.sheetOrder,
    rows: csvTextToRows(sheet.csvText),
  }));

  const byName = new Map(orderedSheets.map((sheet) => [sheet.sheetName, sheet]));

  const newSheets = partnerSnapshots
    .map((snapshot) => {
      const rows = buildPartnerSheetRows(snapshot, adkMap);
      if (!rows) return null;
      return {
        sheetName: sheetNameFromPartnerSnapshot(snapshot),
        rows,
        sheetOrder: orderedSheets.length + 100,
      };
    })
    .filter(Boolean)
    .sort((left, right) => compareDateValues(parseSheetDateFromName(left.sheetName), parseSheetDateFromName(right.sheetName)));

  newSheets.forEach((sheet, index) => {
    byName.set(sheet.sheetName, { ...sheet, sheetOrder: orderedSheets.length + index });
  });

  return [...byName.values()].sort((left, right) => left.sheetOrder - right.sheetOrder);
}

export function buildLegacyWorkbook(workbookType, options = {}) {
  const workbook = XLSX.utils.book_new();

  if (workbookType === LEGACY_WORKBOOK_TYPES.program) {
    const sheets = buildProgramWorkbookSheets(options.importedProgramSheets || {}, options.monthlySnapshots || [], options.shareSnapshots || []);
    PROGRAM_WORKBOOK_SHEETS.forEach((sheetName) => {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheets[sheetName] || [[]]), sheetName);
    });
    return workbook;
  }

  const burnDownSheets = buildBurnDownSheets(options.importedBurnDownSheets || [], options.partnerSnapshots || [], options.adkMap || {});
  burnDownSheets.forEach((sheet) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows || [[]]), sheet.sheetName.slice(0, 31));
  });
  return workbook;
}

export function downloadWorkbook(workbook, filename) {
  XLSX.writeFile(workbook, filename);
}

export function buildImportSummary(workbookType, sheets = []) {
  return `${sheets.length} ${workbookTypeLabel(workbookType).toLowerCase()} sheet${sheets.length === 1 ? '' : 's'} imported`;
}
