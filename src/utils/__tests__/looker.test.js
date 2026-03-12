import JSZip from 'jszip';
import {
  buildMonthlyDataset,
  identifyLookerZipRole,
  identifyMetricTypeFromFilename,
  parseLookerMetricRows,
  parseLookerZip,
} from '../looker';

async function buildZipFile(entries) {
  const zip = new JSZip();

  entries.forEach(([name, text]) => {
    zip.file(name, text);
  });

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });

  return {
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
  };
}

describe('looker utilities', () => {
  test('identifies Looker zip files by filename', () => {
    expect(identifyMetricTypeFromFilename('exports/ACTIVE_ACCOUNTS.csv')).toBe('mau');
    expect(identifyLookerZipRole('exports/playback_hours_(data).csv')).toBe('partnerMetric');
    expect(identifyLookerZipRole('exports/unknown.csv')).toBeNull();
  });

  test('parses pivoted platform metric rows into normalized platform series', () => {
    const rows = [
      {
        'Device Platform': 'Date',
        'PlayStation 5': 'PlayStation 5',
        Xbox: 'Xbox',
        'Rust Partner': 'Rust Partner',
      },
      {
        'Device Platform': '2026-01-01',
        'PlayStation 5': '100',
        Xbox: '200',
        'Rust Partner': '300',
      },
      {
        'Device Platform': '2026-02-01',
        'PlayStation 5': '110',
        Xbox: '210',
        'Rust Partner': '310',
      },
    ];

    const metricRows = parseLookerMetricRows(rows, 'mau', 'platform');
    const seriesByPlatform = buildMonthlyDataset({ mau: metricRows }, ['ADK', 'PlayStation', 'Xbox']);

    expect(metricRows).toEqual([
      { month: '2026-01-01', entity: 'PlayStation', value: 100 },
      { month: '2026-01-01', entity: 'Xbox', value: 200 },
      { month: '2026-01-01', entity: 'ADK', value: 300 },
      { month: '2026-02-01', entity: 'PlayStation', value: 110 },
      { month: '2026-02-01', entity: 'Xbox', value: 210 },
      { month: '2026-02-01', entity: 'ADK', value: 310 },
    ]);
    expect(seriesByPlatform.ADK[1]).toMatchObject({ month: '2026-02-01', mau: 310, hpv: null });
  });

  test('parses supported CSV entries from a Looker zip and preserves raw text', async () => {
    const file = await buildZipFile([
      ['exports/active_accounts.csv', 'Month,Device Platform,Total Active Accounts\n2026-02-01,PlayStation,100\n'],
      ['exports/regional_device_distribution.csv', 'Partner,APAC,DOMESTIC\nMetric,Devices,Devices\nPartner A,1,2\n'],
      ['exports/ignore.txt', 'ignored'],
    ]);

    const parsedFiles = await parseLookerZip(file);

    expect(parsedFiles).toHaveLength(2);
    expect(parsedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'active_accounts.csv',
          metricType: 'mau',
          zipRole: 'platformMetric',
          rawText: expect.stringContaining('Total Active Accounts'),
        }),
        expect.objectContaining({
          name: 'regional_device_distribution.csv',
          metricType: null,
          zipRole: 'regionalDeviceDistribution',
          rawText: expect.stringContaining('Partner A'),
        }),
      ])
    );
  });
});
