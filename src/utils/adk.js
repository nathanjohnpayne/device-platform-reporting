function coreVersionCandidates(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const base = raw.split('+')[0].trim();
  return [...new Set([raw, raw.toLowerCase(), base, base.toLowerCase()].filter(Boolean))];
}

export function buildAdkVersionMap(versions = []) {
  const map = {};

  versions.forEach((version) => {
    (version.coreVersions || [version.coreVersion]).forEach((coreVersion) => {
      coreVersionCandidates(coreVersion).forEach((candidate) => {
        if (!candidate) return;
        map[candidate] = version.adkVersion;
      });
    });
  });

  return map;
}

export function resolveAdkVersionLabel(coreVersion, adkMap = {}) {
  const raw = String(coreVersion || '').trim();
  if (!raw) return 'Unknown';

  for (const candidate of coreVersionCandidates(raw)) {
    if (adkMap[candidate]) return adkMap[candidate];
  }

  return raw;
}
