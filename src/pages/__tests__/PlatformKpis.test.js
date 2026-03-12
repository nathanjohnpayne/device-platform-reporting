/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlatformKpis from '../PlatformKpis';

const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn();
const mockUseAutoImport = jest.fn();
const mockParseLookerZip = jest.fn();
const mockBuildRegionalEstimate = jest.fn();

jest.mock('../../firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, name) => ({ type: 'collection', name })),
  doc: jest.fn((_db, collectionName, id) => ({ type: 'doc', collectionName, id })),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  orderBy: jest.fn((field, direction) => ({ type: 'orderBy', field, direction })),
  query: jest.fn((ref, ...clauses) => ({ type: 'query', ref, clauses })),
}));

jest.mock('../../hooks/useAutoImport', () => ({
  __esModule: true,
  default: (...args) => mockUseAutoImport(...args),
}));

jest.mock('../../utils/legacyWorkbooks', () => ({
  buildLegacyPlatformSnapshot: jest.fn(() => null),
}));

jest.mock('../../utils/looker', () => {
  const actual = jest.requireActual('../../utils/looker');
  return {
    ...actual,
    parseLookerZip: (...args) => mockParseLookerZip(...args),
  };
});

jest.mock('../../utils/regionalEstimates', () => {
  const actual = jest.requireActual('../../utils/regionalEstimates');
  return {
    ...actual,
    buildRegionalEstimate: (...args) => mockBuildRegionalEstimate(...args),
  };
});

jest.mock('../../components/AutoSaveStatus', () => ({
  __esModule: true,
  default: ({ status }) => <div data-testid="auto-save-status">{status}</div>,
}));

jest.mock('../../components/ChartWrapper', () => ({
  __esModule: true,
  default: ({ title, children }) => (
    <div data-testid="chart-wrapper">
      <div>{title}</div>
      {children}
    </div>
  ),
}));

jest.mock('../../components/ConfluenceCopyButtons', () => ({
  __esModule: true,
  default: () => <div data-testid="confluence-copy-buttons" />,
}));

jest.mock('../../components/ConfluencePreview', () => ({
  __esModule: true,
  default: ({ content }) => <div data-testid="confluence-preview">{content}</div>,
}));

jest.mock('../../components/ConflictDialog', () => ({
  __esModule: true,
  default: () => <div data-testid="conflict-dialog" />,
}));

jest.mock('../../components/MissingDataGuidance', () => ({
  __esModule: true,
  default: () => <div data-testid="missing-data-guidance" />,
}));

jest.mock('../../components/UploadZone', () => ({
  __esModule: true,
  default: ({ label, onFileSelected, onParsed }) => (
    <button
      type="button"
      onClick={() => {
        if (onFileSelected) return onFileSelected({ name: 'looker-export.zip' });
        if (onParsed) return onParsed([], [], label);
        return null;
      }}
    >
      {label}
    </button>
  ),
}));

jest.mock('recharts', () => {
  const React = require('react');
  const Mock = ({ children }) => <div>{children}</div>;

  return {
    CartesianGrid: Mock,
    Cell: Mock,
    Legend: Mock,
    Line: Mock,
    LineChart: Mock,
    Pie: Mock,
    PieChart: Mock,
    Tooltip: Mock,
    XAxis: Mock,
    YAxis: Mock,
  };
});

function docSnap(data, id = 'doc-1') {
  return {
    id,
    data: () => data,
  };
}

function existingSnapshot(month = '2026-02') {
  return docSnap({
    type: 'platformKpis',
    seriesByPlatform: {
      PlayStation: [{
        month,
        entity: 'PlayStation',
        mau: 100,
        mad: 50,
        hrs: 200,
        hpv: 2,
      }],
    },
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PlatformKpis />
    </MemoryRouter>
  );
}

describe('PlatformKpis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAutoImport.mockReturnValue({
      status: 'idle',
      error: '',
      importedAtMs: null,
      rollbackUntilMs: null,
      conflictData: null,
      conflictResolving: false,
      rollback: jest.fn(),
      resolveConflict: jest.fn(),
    });
    mockBuildRegionalEstimate.mockReturnValue({
      month: '2026-02',
      seriesByRegion: {
        APAC: [{ month: '2026-02', region: 'APAC', mau: 25, mad: 10, hrs: 20 }],
        DOMESTIC: [{ month: '2026-02', region: 'DOMESTIC', mau: 25, mad: 10, hrs: 20 }],
        EMEA: [{ month: '2026-02', region: 'EMEA', mau: 25, mad: 10, hrs: 20 }],
        LATAM: [{ month: '2026-02', region: 'LATAM', mau: 25, mad: 10, hrs: 20 }],
      },
      directMixByMetric: {
        mau: { APAC: 0.25, DOMESTIC: 0.25, EMEA: 0.25, LATAM: 0.25 },
        mad: { APAC: 0.25, DOMESTIC: 0.25, EMEA: 0.25, LATAM: 0.25 },
        hrs: { APAC: 0.25, DOMESTIC: 0.25, EMEA: 0.25, LATAM: 0.25 },
      },
      fallbackMetrics: [],
    });
  });

  test('surfaces partner mapping load errors once the monthly UI is visible', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockGetDocs.mockImplementation(async (ref) => {
      if (ref.type === 'query' && ref.ref.name === 'monthlySnapshots') {
        return { docs: [] };
      }

      if (ref.type === 'collection' && ref.name === 'partnerRegionMappings') {
        throw new Error('permission denied');
      }

      return { docs: [] };
    });
    mockGetDoc.mockResolvedValue({
      exists: () => false,
      data: () => null,
    });
    mockParseLookerZip.mockResolvedValue([
      {
        name: 'active_accounts.csv',
        rows: [{ Month: '2026-02-01', 'Device Platform': 'PlayStation', 'Total Active Accounts': '100' }],
        rawText: 'Month,Device Platform,Total Active Accounts\n2026-02-01,PlayStation,100\n',
        metricType: 'mau',
        zipRole: 'platformMetric',
      },
      {
        name: 'active_devices.csv',
        rows: [{ Month: '2026-02-01', 'Device Platform': 'PlayStation', 'Total Active Devices': '50' }],
        rawText: 'Month,Device Platform,Total Active Devices\n2026-02-01,PlayStation,50\n',
        metricType: 'mad',
        zipRole: 'platformMetric',
      },
      {
        name: 'playback_hours.csv',
        rows: [{ Month: '2026-02-01', 'Device Platform': 'PlayStation', 'Total Playback Hours': '200' }],
        rawText: 'Month,Device Platform,Total Playback Hours\n2026-02-01,PlayStation,200\n',
        metricType: 'hrs',
        zipRole: 'platformMetric',
      },
    ]);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Drop Looker ZIP here' }));

    expect(await screen.findByText(/Unable to load the partner-region mapping\./)).toBeTruthy();
    expect(screen.getByText(/permission denied/)).toBeTruthy();

    consoleErrorSpy.mockRestore();
  });

  test('includes the fallback warning in the regional UI and Confluence output after a zip upload', async () => {
    mockGetDocs.mockImplementation(async (ref) => {
      if (ref.type === 'query' && ref.ref.name === 'monthlySnapshots') {
        return { docs: [] };
      }

      if (ref.type === 'collection' && ref.name === 'partnerRegionMappings') {
        return {
          docs: [docSnap({
            partnerKeyNormalized: 'partnera',
            friendlyPartnerNameNormalized: 'partnera',
            dashboardAliasesNormalized: [],
            resolvedRegion: 'APAC',
          }, 'partner-a')],
        };
      }

      return { docs: [] };
    });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        sourceFileName: 'mapping.csv',
        importedAt: null,
      }),
    });
    mockParseLookerZip.mockResolvedValue([
      {
        name: 'active_accounts.csv',
        rows: [{ Month: '2026-02-01', 'Device Platform': 'PlayStation', 'Total Active Accounts': '100' }],
        rawText: 'Month,Device Platform,Total Active Accounts\n2026-02-01,PlayStation,100\n',
        metricType: 'mau',
        zipRole: 'platformMetric',
      },
      {
        name: 'active_devices.csv',
        rows: [{ Month: '2026-02-01', 'Device Platform': 'PlayStation', 'Total Active Devices': '50' }],
        rawText: 'Month,Device Platform,Total Active Devices\n2026-02-01,PlayStation,50\n',
        metricType: 'mad',
        zipRole: 'platformMetric',
      },
      {
        name: 'playback_hours.csv',
        rows: [{ Month: '2026-02-01', 'Device Platform': 'PlayStation', 'Total Playback Hours': '200' }],
        rawText: 'Month,Device Platform,Total Playback Hours\n2026-02-01,PlayStation,200\n',
        metricType: 'hrs',
        zipRole: 'platformMetric',
      },
      {
        name: 'active_accounts_(data).csv',
        rows: [],
        rawText: 'partner metric mau',
        metricType: 'mau',
        zipRole: 'partnerMetric',
      },
      {
        name: 'playback_hours_(data).csv',
        rows: [],
        rawText: 'partner metric hrs',
        metricType: 'hrs',
        zipRole: 'partnerMetric',
      },
      {
        name: 'regional_device_distribution.csv',
        rows: [],
        rawText: 'regional distribution',
        metricType: null,
        zipRole: 'regionalDeviceDistribution',
      },
      {
        name: 'average_daily_active_devices.csv',
        rows: [],
        rawText: 'average daily devices',
        metricType: null,
        zipRole: 'averageDailyActiveDevices',
      },
    ]);
    mockBuildRegionalEstimate.mockReturnValue({
      month: '2026-02',
      seriesByRegion: {
        APAC: [{ month: '2026-02', region: 'APAC', mau: 25, mad: 25, hrs: 25 }],
        DOMESTIC: [{ month: '2026-02', region: 'DOMESTIC', mau: 25, mad: 25, hrs: 25 }],
        EMEA: [{ month: '2026-02', region: 'EMEA', mau: 25, mad: 25, hrs: 25 }],
        LATAM: [{ month: '2026-02', region: 'LATAM', mau: 25, mad: 25, hrs: 25 }],
      },
      directMixByMetric: {
        mau: { APAC: 0.25, DOMESTIC: 0.25, EMEA: 0.25, LATAM: 0.25 },
        mad: { APAC: 0.25, DOMESTIC: 0.25, EMEA: 0.25, LATAM: 0.25 },
        hrs: { APAC: 0.25, DOMESTIC: 0.25, EMEA: 0.25, LATAM: 0.25 },
      },
      fallbackMetrics: ['MAU'],
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Drop Looker ZIP here' }));

    expect(await screen.findByText(/No directly mapped regional base was available for MAU/)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('confluence-preview').textContent).toContain(
        '⚠️ Note: MAU used equal-split fallback allocation'
      );
    });
  });
});
