import { buildRegionalEstimate } from '../regionalEstimates';

function buildPartnerMetricCsv(rows) {
  return [
    'Partner,Partner A,Partner B,Partner C',
    'Metric,Value,Value,Value',
    ...rows.map((row) => row.join(',')),
  ].join('\n');
}

function buildRegionalDeviceDistributionCsv(rows) {
  return [
    'Partner,APAC,DOMESTIC,EMEA,LATAM,Other',
    'Metric,Devices,Devices,Devices,Devices,Devices',
    ...rows.map((row) => row.join(',')),
  ].join('\n');
}

function buildMappingRow(name, region) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '');

  return {
    id: normalized,
    partnerKey: name,
    friendlyPartnerName: name,
    countriesOperateIso2: [],
    regionsOperate: region || '',
    resolvedRegion: region,
    dashboardAliases: [],
    partnerKeyNormalized: normalized,
    friendlyPartnerNameNormalized: normalized,
    dashboardAliasesNormalized: [],
  };
}

describe('regionalEstimates', () => {
  test('allocates global partner pools using the observed direct-mapped mix', () => {
    const result = buildRegionalEstimate({
      activeAccountText: buildPartnerMetricCsv([
        ['2026-02-01', 100, 300, 600],
      ]),
      playbackHoursText: buildPartnerMetricCsv([
        ['2026-02-01', 10, 30, 60],
      ]),
      regionalDeviceDistributionText: buildRegionalDeviceDistributionCsv([
        ['Partner A', 1, 0, 0, 0, 0],
        ['Partner B', 0, 2, 0, 0, 0],
        ['Partner C', 0, 0, 0, 0, 3],
      ]),
      averageDailyActiveDevicesText: 'Average Daily Active Devices\n600\n',
      mappings: [
        buildMappingRow('Partner A', 'APAC'),
        buildMappingRow('Partner B', 'DOMESTIC'),
      ],
      mappingImportedAt: 1700000000000,
      sourceFiles: ['active_accounts_(data).csv', 'playback_hours_(data).csv'],
    });

    expect(result.month).toBe('2026-02');
    expect(result.fallbackMetrics).toEqual([]);
    expect(result.seriesByRegion.APAC[0]).toMatchObject({
      mau: 250,
      mad: 200,
      hrs: 25,
    });
    expect(result.seriesByRegion.DOMESTIC[0]).toMatchObject({
      mau: 750,
      mad: 400,
      hrs: 75,
    });
    expect(result.seriesByRegion.EMEA[0]).toMatchObject({
      mau: 0,
      mad: 0,
      hrs: 0,
    });
    expect(result.directMixByMetric.mau).toMatchObject({
      APAC: 0.25,
      DOMESTIC: 0.75,
      EMEA: 0,
      LATAM: 0,
    });
    expect(result.totals).toMatchObject({
      mau: 1000,
      mad: 600,
      hrs: 100,
    });
  });

  test('uses an equal split fallback when no direct partner-region mappings exist', () => {
    const result = buildRegionalEstimate({
      activeAccountText: buildPartnerMetricCsv([
        ['2026-02-01', 40, 60, 0],
      ]),
      playbackHoursText: buildPartnerMetricCsv([
        ['2026-02-01', 100, 300, 0],
      ]),
      regionalDeviceDistributionText: buildRegionalDeviceDistributionCsv([
        ['Partner A', 1, 0, 0, 0, 0],
        ['Partner B', 0, 3, 0, 0, 0],
      ]),
      averageDailyActiveDevicesText: 'Average Daily Active Devices\n400\n',
      mappings: [],
    });

    expect(result.fallbackMetrics).toEqual(['MAU', 'MAD', 'Playback Hours']);
    expect(result.directMixByMetric.mau).toMatchObject({
      APAC: 0.25,
      DOMESTIC: 0.25,
      EMEA: 0.25,
      LATAM: 0.25,
    });
    expect(result.seriesByRegion.APAC[0]).toMatchObject({
      mau: 25,
      mad: 100,
      hrs: 100,
    });
    expect(result.seriesByRegion.LATAM[0]).toMatchObject({
      mau: 25,
      mad: 100,
      hrs: 100,
    });
  });

  test('rejects mixed-month partner metric uploads', () => {
    expect(() => buildRegionalEstimate({
      activeAccountText: buildPartnerMetricCsv([
        ['2026-01-01', 100, 200, 0],
      ]),
      playbackHoursText: buildPartnerMetricCsv([
        ['2026-02-01', 10, 20, 0],
      ]),
      regionalDeviceDistributionText: buildRegionalDeviceDistributionCsv([
        ['Partner A', 1, 0, 0, 0, 0],
      ]),
      averageDailyActiveDevicesText: 'Average Daily Active Devices\n100\n',
      mappings: [buildMappingRow('Partner A', 'APAC')],
    })).toThrow(
      'Month mismatch: Active Accounts is 2026-01, Playback Hours is 2026-02. Upload exports from the same month.'
    );
  });
});
