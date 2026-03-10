import Papa from 'papaparse';
import { classifyMetric, humanizeMetric, normalizeDateValue, parseNumber } from './reporting';

function parseCsvLine(line) {
  const result = Papa.parse(line, { header: false, skipEmptyLines: false });
  return (result.data[0] || []).map((cell) => String(cell || '').trim());
}

function normalizeFilterLabel(value = '') {
  return String(value)
    .replace(/^Data For filter:\s*/i, '')
    .replace(/^NCP\+ADK:\s*/i, '')
    .replace(/\s*\(all\)\s*$/i, '')
    .trim();
}

function parseHeaderRows(text) {
  const result = Papa.parse(String(text || ''), {
    header: true,
    skipEmptyLines: true,
  });

  return (result.data || []).filter((row) => (
    Object.values(row || {}).some((value) => String(value || '').trim() !== '')
  ));
}

function looksLikeVersionFilterLabel(value = '') {
  const normalized = normalizeFilterLabel(value);

  if (!normalized) return false;
  return !/(all traffic|playstation|xbox|stb\b)/i.test(normalized);
}

export function parseConvivaPlaybackRows(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const groupedRows = new Map();
  let sectionTitle = '';
  let filterLabel = '';
  let headerLabel = '';

  lines.forEach((line) => {
    const cells = parseCsvLine(line);
    const populated = cells.filter((cell) => cell !== '');

    if (!populated.length) {
      filterLabel = '';
      headerLabel = '';
      return;
    }

    if (populated.length === 1) {
      const value = populated[0];
      if (/^Data For filter:/i.test(value)) {
        filterLabel = normalizeFilterLabel(value);
        headerLabel = '';
        return;
      }

      sectionTitle = value;
      return;
    }

    if (/^Timestamp$/i.test(populated[0])) {
      headerLabel = populated[1] || '';
      return;
    }

    if (!filterLabel || !headerLabel) return;

    const timestamp = populated[0];
    if (!timestamp || /^Total$/i.test(timestamp)) return;

    const metric = classifyMetric(headerLabel) || classifyMetric(sectionTitle);
    const value = parseNumber(populated[1]);
    if (!metric || value == null) return;

    // Conviva mixes daily and 12-hour points in the same export. Bucket by
    // normalized day so the playback charts stay on a daily cadence.
    const key = normalizeDateValue(timestamp) || timestamp;
    if (!groupedRows.has(key)) {
      groupedRows.set(key, { Timestamp: key });
    }

    groupedRows.get(key)[`${humanizeMetric(metric)}: ${filterLabel}`] = value;
  });

  return [...groupedRows.values()];
}

export function parseConvivaVersionShareRows(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const groupedRows = new Map();
  let filterLabel = '';
  let headerLabel = '';

  lines.forEach((line) => {
    const cells = parseCsvLine(line);
    const populated = cells.filter((cell) => cell !== '');

    if (!populated.length) {
      filterLabel = '';
      headerLabel = '';
      return;
    }

    if (populated.length === 1) {
      const value = populated[0];

      if (/^Data For filter:/i.test(value)) {
        filterLabel = normalizeFilterLabel(value);
        headerLabel = '';
      }

      return;
    }

    if (/^Timestamp$/i.test(populated[0])) {
      headerLabel = populated[1] || '';
      return;
    }

    if (!filterLabel || !headerLabel || !looksLikeVersionFilterLabel(filterLabel)) return;
    if (!/unique devices/i.test(headerLabel)) return;

    const timestamp = populated[0];
    if (!timestamp || /^Total$/i.test(timestamp)) return;

    const value = parseNumber(populated[1]);
    if (value == null) return;

    const rowKey = `${normalizeDateValue(timestamp) || timestamp}::${filterLabel}`;
    groupedRows.set(rowKey, {
      Timestamp: timestamp,
      core_version: filterLabel,
      count_unique_device_id: value,
    });
  });

  return groupedRows.size ? [...groupedRows.values()] : parseHeaderRows(text);
}
