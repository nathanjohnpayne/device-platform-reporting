export function normalizeFieldName(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  const cleaned = String(value).trim().replace(/,/g, '').replace(/%/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function compactNumber(value, digits = 1) {
  const numeric = parseNumber(value);
  if (numeric == null) return '—';
  if (Math.abs(numeric) >= 1e9) return `${(numeric / 1e9).toFixed(digits)}B`;
  if (Math.abs(numeric) >= 1e6) return `${(numeric / 1e6).toFixed(digits)}M`;
  if (Math.abs(numeric) >= 1e3) return `${(numeric / 1e3).toFixed(digits)}K`;
  return numeric.toFixed(digits > 0 && numeric % 1 !== 0 ? digits : 0);
}

export function formatPercent(value, digits = 1) {
  const numeric = parseNumber(value);
  return numeric == null ? '—' : `${numeric.toFixed(digits)}%`;
}

export function safePercent(part, total, digits = 1) {
  const numerator = parseNumber(part);
  const denominator = parseNumber(total);
  if (numerator == null || denominator == null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

export function toPercentChange(current, previous) {
  const curr = parseNumber(current);
  const prev = parseNumber(previous);
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function formatChange(value, digits = 2, withPlus = true) {
  const numeric = parseNumber(value);
  if (numeric == null) return '—';
  const prefix = withPlus && numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(digits)}%`;
}

export function getFieldValue(row, candidates) {
  const entries = Object.entries(row || {});
  const normalized = new Map(entries.map(([key, value]) => [normalizeFieldName(key), value]));

  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      const match = entries.find(([key, value]) => candidate(key, value));
      if (match) return match[1];
      continue;
    }

    const direct = normalized.get(normalizeFieldName(candidate));
    if (direct != null && String(direct).trim() !== '') return direct;
  }

  return '';
}

export function guessDateKey(row) {
  return Object.keys(row || {}).find((key) => /(date|day|week|month|period)/i.test(key)) || null;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function normalizeDateValue(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const isoMonth = raw.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) return `${isoMonth[1]}-${isoMonth[2]}`;

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

  const slashDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashDate) {
    const [, month, day, year] = slashDate;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${pad(month)}-${pad(day)}`;
  }

  const monthWord = Date.parse(raw);
  if (!Number.isNaN(monthWord)) {
    const parsed = new Date(monthWord);
    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth() + 1;
    const day = parsed.getUTCDate();
    if (/\b\d{4}\b/.test(raw) && !/\b\d{1,2}\b.*\b\d{1,2}\b/.test(raw) && /[A-Za-z]/.test(raw) && !/[/-]\d{1,2}[/-]\d{1,2}/.test(raw)) {
      return `${year}-${pad(month)}`;
    }
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  return raw;
}

export function compareDateValues(a, b) {
  return normalizeDateValue(a).localeCompare(normalizeDateValue(b));
}

export function sortDateValues(values) {
  return [...values].sort(compareDateValues);
}

export function formatDateLabel(value) {
  const normalized = normalizeDateValue(value);
  if (!normalized) return '';
  if (/^\d{4}-\d{2}$/.test(normalized)) {
    const [year, month] = normalized.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }
  return normalized;
}

export function classifyMetric(key = '') {
  const normalized = normalizeFieldName(key);
  if (normalized.includes('vsf')) return 'vsf';
  if (normalized.includes('vpf')) return 'vpf';
  if (normalized.includes('attempt')) return 'attempts';
  if (normalized.includes('uniquedevice') || normalized.includes('devicewithattempt') || normalized.includes('countuniquedevice')) return 'uniqueDevices';
  return null;
}

export function humanizeMetric(metric) {
  if (metric === 'attempts') return 'Attempts';
  if (metric === 'uniqueDevices') return 'Unique Devices';
  if (metric === 'vsf') return 'VSF-T';
  if (metric === 'vpf') return 'VPF-T';
  if (metric === 'hpv') return 'HPV';
  return metric;
}

export function getChangeClass(value) {
  const numeric = parseNumber(value);
  if (numeric == null) return '';
  return numeric < 0 ? 'neg' : 'pos';
}
