import Papa from 'papaparse';
import { normalizeFieldName } from './reporting';

export const ESTIMATE_REGIONS = ['APAC', 'DOMESTIC', 'EMEA', 'LATAM'];
export const PARTNER_REGION_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gla_k5-dERGc10XwS1R56E_69FAFreXRjVso_LEuYoU/edit?gid=0#gid=0';
export const REGIONAL_ESTIMATE_DISCLAIMER = 'This is an estimation model, not a ground-truth geographic attribution model.';

const REQUIRED_FIELDS = ['partner_key', 'friendly_partner_name', 'countries_operate_iso2', 'regions_operate'];

function parseList(value = '') {
  return String(value || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizedMapPush(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function normalizePartnerMappingKey(value = '') {
  return normalizeFieldName(value);
}

export function normalizeMappedRegion(value = '') {
  const tokens = parseList(value)
    .map((token) => normalizeFieldName(token))
    .filter(Boolean);

  if (!tokens.length) return null;
  if (tokens.some((token) => /worldwide|global|allregions|unknown/.test(token))) return null;

  const mapped = [...new Set(tokens.map((token) => {
    if (token === 'na' || token === 'northamerica' || token === 'domestic') return 'DOMESTIC';
    if (token === 'apac' || token === 'asiapacific') return 'APAC';
    if (token === 'emea') return 'EMEA';
    if (token === 'latam' || token === 'latinamerica') return 'LATAM';
    return null;
  }).filter(Boolean))];

  // Multi-region partners stay in the global/unmapped pool so the estimator only
  // uses directly coded single-region partners to derive the allocation mix.
  return mapped.length === 1 ? mapped[0] : null;
}

export function parsePartnerRegionMappingCsv(text) {
  const result = Papa.parse(String(text || ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (value) => String(value || '').trim(),
  });

  const blockingError = (result.errors || []).find((error) => error.code !== 'UndetectableDelimiter');
  if (blockingError) {
    throw new Error(blockingError.message);
  }

  const fields = (result.meta.fields || []).filter(Boolean);
  const fieldMap = Object.fromEntries(fields.map((field) => [normalizeFieldName(field), field]));
  const missing = REQUIRED_FIELDS.filter((field) => !fieldMap[normalizeFieldName(field)]);

  if (missing.length) {
    throw new Error(`Mapping import is missing required columns: ${missing.join(', ')}`);
  }

  const parsedRows = [];
  const seenIds = new Set();

  (result.data || []).forEach((rawRow, index) => {
    const row = Object.fromEntries(
      Object.entries(rawRow || {})
        .filter(([key]) => String(key || '').trim() !== '')
        .map(([key, value]) => [key, String(value || '').trim()])
    );

    if (!Object.values(row).some(Boolean)) return;

    const partnerKey = row[fieldMap.partnerkey] || '';
    const friendlyPartnerName = row[fieldMap.friendlypartnername] || '';
    const countriesOperateIso2 = parseList(row[fieldMap.countriesoperateiso2] || '');
    const regionsOperate = row[fieldMap.regionsoperate] || '';
    const dashboardAliases = parseList(row[fieldMap.dashboardaliases] || '');
    const idSource = partnerKey || friendlyPartnerName;
    const id = normalizePartnerMappingKey(idSource);

    if (!friendlyPartnerName) {
      throw new Error(`Row ${index + 2} is missing friendly_partner_name.`);
    }

    if (!id) {
      throw new Error(`Row ${index + 2} is missing both partner_key and friendly_partner_name.`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Mapping import contains a duplicate row id for "${idSource}".`);
    }

    seenIds.add(id);
    parsedRows.push({
      id,
      partnerKey,
      friendlyPartnerName,
      countriesOperateIso2,
      regionsOperate,
      resolvedRegion: normalizeMappedRegion(regionsOperate),
      dashboardAliases,
      partnerKeyNormalized: normalizePartnerMappingKey(partnerKey),
      friendlyPartnerNameNormalized: normalizePartnerMappingKey(friendlyPartnerName),
      dashboardAliasesNormalized: dashboardAliases.map(normalizePartnerMappingKey).filter(Boolean),
    });
  });

  return {
    rows: parsedRows,
    rowCount: parsedRows.length,
    aliasCount: parsedRows.reduce((sum, row) => sum + row.dashboardAliases.length, 0),
  };
}

export function buildPartnerRegionIndex(rows = []) {
  const byAlias = new Map();
  const byPartnerKey = new Map();
  const byFriendlyName = new Map();

  rows.forEach((row) => {
    (row.dashboardAliasesNormalized || []).forEach((alias) => normalizedMapPush(byAlias, alias, row));
    normalizedMapPush(byPartnerKey, row.partnerKeyNormalized, row);
    normalizedMapPush(byFriendlyName, row.friendlyPartnerNameNormalized, row);
  });

  return { byAlias, byPartnerKey, byFriendlyName };
}

function resolveMatchRows(matchRows = []) {
  if (!matchRows.length) return { kind: 'global', region: null };

  const resolvedRegions = [...new Set(matchRows.map((row) => row.resolvedRegion).filter(Boolean))];
  if (resolvedRegions.length === 1 && matchRows.every((row) => row.resolvedRegion === resolvedRegions[0])) {
    return { kind: 'direct', region: resolvedRegions[0] };
  }

  // Conflicting or partially global matches fall back to the global pool so a
  // shared alias cannot directly attribute the same dashboard column twice.
  return { kind: 'global', region: null };
}

export function resolvePartnerRegion(label, index) {
  const normalized = normalizePartnerMappingKey(label);
  if (!normalized) return { kind: 'global', region: null, matches: [] };

  const aliasMatches = index.byAlias.get(normalized);
  if (aliasMatches?.length) {
    return {
      ...resolveMatchRows(aliasMatches),
      matches: aliasMatches,
      matchedBy: 'dashboard_aliases',
    };
  }

  const keyMatches = index.byPartnerKey.get(normalized);
  if (keyMatches?.length) {
    return {
      ...resolveMatchRows(keyMatches),
      matches: keyMatches,
      matchedBy: 'partner_key',
    };
  }

  const friendlyMatches = index.byFriendlyName.get(normalized);
  if (friendlyMatches?.length) {
    return {
      ...resolveMatchRows(friendlyMatches),
      matches: friendlyMatches,
      matchedBy: 'friendly_partner_name',
    };
  }

  return { kind: 'global', region: null, matches: [], matchedBy: '' };
}
