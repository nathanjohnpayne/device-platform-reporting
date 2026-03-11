import Papa from 'papaparse';
import { compareDateValues, normalizeDateValue, parseNumber, toPercentChange } from './reporting';
import { ESTIMATE_REGIONS, REGIONAL_ESTIMATE_DISCLAIMER, buildPartnerRegionIndex, resolvePartnerRegion } from './partnerRegionMapping';

function parseCsvMatrix(text) {
  return Papa.parse(String(text || ''), {
    header: false,
    skipEmptyLines: true,
  }).data.map((row) => (row || []).map((cell) => String(cell || '').trim()));
}

function sortDateRows(rows = []) {
  return [...rows].sort((left, right) => compareDateValues(left.date, right.date));
}

export function buildRegionSummary(rowsByRegion) {
  return ESTIMATE_REGIONS.filter((region) => rowsByRegion[region]?.length).map((region) => {
    const rows = rowsByRegion[region];
    const current = rows[rows.length - 1] || {};
    const previous = rows[rows.length - 2] || {};

    return {
      region,
      month: current.month || '',
      current,
      previous,
      mauMoM: toPercentChange(current.mau, previous.mau),
      madMoM: toPercentChange(current.mad, previous.mad),
      hrsMoM: toPercentChange(current.hrs, previous.hrs),
    };
  });
}

export function parseLatestPartnerMetricSnapshot(text) {
  const rows = parseCsvMatrix(text);
  if (rows.length < 3) {
    throw new Error('Partner metric export is missing the expected Looker matrix rows.');
  }

  const partnerLabels = rows[0].slice(1).map((label) => String(label || '').trim());
  const dataRows = sortDateRows(
    rows.slice(2)
      .map((row) => ({
        rawDate: row[0],
        date: normalizeDateValue(row[0]),
        values: partnerLabels.reduce((acc, label, index) => {
          const value = parseNumber(row[index + 1]);
          if (value != null) acc[label] = value;
          return acc;
        }, {}),
      }))
      .filter((row) => row.date && Object.keys(row.values).length)
  );

  const latest = dataRows[dataRows.length - 1];
  if (!latest) {
    throw new Error('Partner metric export did not contain any readable partner values.');
  }

  return {
    month: latest.date.slice(0, 7),
    date: latest.date,
    values: latest.values,
  };
}

export function parseAverageDailyScalar(text) {
  const rows = parseCsvMatrix(text);
  const numericValues = rows
    .flatMap((row) => row.map((value) => parseNumber(value)))
    .filter((value) => value != null);

  if (!numericValues.length) {
    throw new Error('Average daily active devices export did not contain a readable total.');
  }

  return numericValues[numericValues.length - 1];
}

export function parseRegionalDeviceDistribution(text) {
  const rows = parseCsvMatrix(text);
  if (rows.length < 3) {
    throw new Error('Regional device distribution export is missing the expected Looker matrix rows.');
  }

  const entries = rows.slice(2)
    .map((row) => {
      const partner = String(row[0] || '').trim();
      if (!partner) return null;

      const total = row
        .slice(1)
        .reduce((sum, value) => sum + (parseNumber(value) || 0), 0);

      if (!total) return null;
      return { partner, total };
    })
    .filter(Boolean);

  if (!entries.length) {
    throw new Error('Regional device distribution export did not contain any readable partner totals.');
  }

  return entries;
}

function equalRegionMix() {
  return Object.fromEntries(ESTIMATE_REGIONS.map((region) => [region, 1 / ESTIMATE_REGIONS.length]));
}

function allocateMetric(valuesByLabel, index) {
  const directTotals = Object.fromEntries(ESTIMATE_REGIONS.map((region) => [region, 0]));
  let globalPool = 0;

  Object.entries(valuesByLabel || {}).forEach(([label, value]) => {
    const numeric = parseNumber(value);
    if (numeric == null) return;

    const resolved = resolvePartnerRegion(label, index);
    if (resolved.kind === 'direct' && resolved.region) {
      directTotals[resolved.region] += numeric;
    } else {
      globalPool += numeric;
    }
  });

  const totalDirect = ESTIMATE_REGIONS.reduce((sum, region) => sum + directTotals[region], 0);
  const usedFallback = totalDirect === 0;
  const weights = usedFallback
    ? equalRegionMix()
    : Object.fromEntries(ESTIMATE_REGIONS.map((region) => [region, directTotals[region] / totalDirect]));

  const totals = Object.fromEntries(
    ESTIMATE_REGIONS.map((region) => [region, directTotals[region] + globalPool * weights[region]])
  );

  return {
    totals,
    weights,
    directTotals,
    globalPool,
    usedFallback,
  };
}

function scaleTotals(totals, grandTotal) {
  const subtotal = ESTIMATE_REGIONS.reduce((sum, region) => sum + (totals[region] || 0), 0);
  if (!subtotal) {
    const evenValue = grandTotal / ESTIMATE_REGIONS.length;
    return Object.fromEntries(ESTIMATE_REGIONS.map((region) => [region, evenValue]));
  }

  return Object.fromEntries(
    ESTIMATE_REGIONS.map((region) => [region, grandTotal * ((totals[region] || 0) / subtotal)])
  );
}

export function buildRegionalEstimate({
  activeAccountText,
  playbackHoursText,
  regionalDeviceDistributionText,
  averageDailyActiveDevicesText,
  mappings = [],
  mappingImportedAt = null,
  sourceFiles = [],
}) {
  const index = buildPartnerRegionIndex(mappings);
  const mauSnapshot = parseLatestPartnerMetricSnapshot(activeAccountText);
  const hrsSnapshot = parseLatestPartnerMetricSnapshot(playbackHoursText);

  if (mauSnapshot.month !== hrsSnapshot.month) {
    throw new Error(
      `Month mismatch: Active Accounts is ${mauSnapshot.month}, Playback Hours is ${hrsSnapshot.month}. Upload exports from the same month.`
    );
  }

  const deviceEntries = parseRegionalDeviceDistribution(regionalDeviceDistributionText);
  const averageDailyActiveDevices = parseAverageDailyScalar(averageDailyActiveDevicesText);

  const mauAllocation = allocateMetric(mauSnapshot.values, index);
  const hrsAllocation = allocateMetric(hrsSnapshot.values, index);
  const madAllocation = allocateMetric(
    Object.fromEntries(deviceEntries.map((entry) => [entry.partner, entry.total])),
    index
  );
  const scaledMadTotals = scaleTotals(madAllocation.totals, averageDailyActiveDevices);

  const month = mauSnapshot.month;
  const seriesByRegion = Object.fromEntries(
    ESTIMATE_REGIONS.map((region) => [region, [{
      month,
      region,
      mau: mauAllocation.totals[region] || 0,
      mad: scaledMadTotals[region] || 0,
      hrs: hrsAllocation.totals[region] || 0,
    }]])
  );

  const summaryRows = buildRegionSummary(seriesByRegion);
  const totals = summaryRows.reduce((acc, row) => ({
    mau: acc.mau + (row.current.mau || 0),
    mad: acc.mad + (row.current.mad || 0),
    hrs: acc.hrs + (row.current.hrs || 0),
  }), { mau: 0, mad: 0, hrs: 0 });

  const fallbackMetrics = [
    mauAllocation.usedFallback ? 'MAU' : null,
    madAllocation.usedFallback ? 'MAD' : null,
    hrsAllocation.usedFallback ? 'Playback Hours' : null,
  ].filter(Boolean);

  return {
    method: 'partner-allocation-v1',
    disclaimer: REGIONAL_ESTIMATE_DISCLAIMER,
    month,
    seriesByRegion,
    summaryRows,
    totals,
    directMixByMetric: {
      mau: mauAllocation.weights,
      mad: madAllocation.weights,
      hrs: hrsAllocation.weights,
    },
    fallbackMetrics,
    mappingImportedAt,
    sourceFiles,
  };
}
