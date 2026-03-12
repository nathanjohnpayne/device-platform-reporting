import {
  buildPartnerRegionIndex,
  normalizeMappedRegion,
  parsePartnerRegionMappingCsv,
  resolvePartnerRegion,
} from '../partnerRegionMapping';

describe('partnerRegionMapping', () => {
  test('parses mapping CSV rows and normalizes aliases', () => {
    const csv = [
      'partner_key,friendly_partner_name,countries_operate_iso2,regions_operate,dashboard_aliases',
      'dt,Deutsche Telekom,DE,EMEA,"DT, Telekom"',
      ',Global Partner,"US; CA",Worldwide,"Global Alias; Shared Alias"',
    ].join('\n');

    const parsed = parsePartnerRegionMappingCsv(csv);

    expect(parsed.rowCount).toBe(2);
    expect(parsed.aliasCount).toBe(4);
    expect(parsed.rows[0]).toMatchObject({
      id: 'dt',
      friendlyPartnerName: 'Deutsche Telekom',
      resolvedRegion: 'EMEA',
      dashboardAliasesNormalized: ['dt', 'telekom'],
    });
    expect(parsed.rows[1]).toMatchObject({
      id: 'globalpartner',
      countriesOperateIso2: ['US', 'CA'],
      resolvedRegion: null,
    });
  });

  test('rejects mapping CSV files with missing required columns', () => {
    const csv = [
      'partner_key,friendly_partner_name,regions_operate',
      'dt,Deutsche Telekom,EMEA',
    ].join('\n');

    expect(() => parsePartnerRegionMappingCsv(csv)).toThrow(
      'Mapping import is missing required columns: countries_operate_iso2'
    );
  });

  test('normalizes supported regions and treats multi-region values as global', () => {
    expect(normalizeMappedRegion('NA')).toBe('DOMESTIC');
    expect(normalizeMappedRegion('APAC')).toBe('APAC');
    expect(normalizeMappedRegion('APAC, EMEA')).toBeNull();
    expect(normalizeMappedRegion('Worldwide')).toBeNull();
  });

  test('resolves mappings by alias, partner key, and friendly name in order', () => {
    const rows = [
      {
        id: 'telekom',
        partnerKeyNormalized: 'dt',
        friendlyPartnerNameNormalized: 'deutschetelekom',
        dashboardAliasesNormalized: ['telekom'],
        resolvedRegion: 'EMEA',
      },
      {
        id: 'roku',
        partnerKeyNormalized: 'rokupartner',
        friendlyPartnerNameNormalized: 'rokupartner',
        dashboardAliasesNormalized: [],
        resolvedRegion: 'APAC',
      },
    ];

    const index = buildPartnerRegionIndex(rows);

    expect(resolvePartnerRegion('Telekom', index)).toMatchObject({
      kind: 'direct',
      region: 'EMEA',
      matchedBy: 'dashboard_aliases',
    });
    expect(resolvePartnerRegion('roku_partner', index)).toMatchObject({
      kind: 'direct',
      region: 'APAC',
      matchedBy: 'partner_key',
    });
    expect(resolvePartnerRegion('Deutsche Telekom', index)).toMatchObject({
      kind: 'direct',
      region: 'EMEA',
      matchedBy: 'friendly_partner_name',
    });
  });

  test('falls back to the global pool when alias matches conflict on region', () => {
    const index = buildPartnerRegionIndex([
      {
        id: 'one',
        partnerKeyNormalized: 'one',
        friendlyPartnerNameNormalized: 'one',
        dashboardAliasesNormalized: ['sharedalias'],
        resolvedRegion: 'APAC',
      },
      {
        id: 'two',
        partnerKeyNormalized: 'two',
        friendlyPartnerNameNormalized: 'two',
        dashboardAliasesNormalized: ['sharedalias'],
        resolvedRegion: 'EMEA',
      },
    ]);

    expect(resolvePartnerRegion('shared alias', index)).toMatchObject({
      kind: 'global',
      region: null,
      matchedBy: 'dashboard_aliases',
    });
  });
});
