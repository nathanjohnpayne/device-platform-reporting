jest.mock('../../firebase', () => ({
  auth: {
    currentUser: {
      uid: 'user-1',
      email: 'user@disney.com',
    },
  },
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  getDocFromServer: jest.fn(),
  query: jest.fn(),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(),
  updateDoc: jest.fn(),
  where: jest.fn(),
  writeBatch: jest.fn(),
}));

import {
  ROLLBACK_WINDOW_MS,
  buildImportBatchId,
  canRollback,
  formatImportTimestamp,
  getRollbackUntilMs,
  timestampToMs,
} from '../importHistory';

describe('importHistory helpers', () => {
  test('buildImportBatchId is stable across key order and non-finite numeric values', async () => {
    const first = await buildImportBatchId('platformKpis', {
      b: Infinity,
      nested: {
        z: 2,
        y: NaN,
      },
      a: 1,
    });
    const second = await buildImportBatchId('platformKpis', {
      a: 1,
      nested: {
        y: null,
        z: 2,
      },
      b: null,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^platformKpis-/);
  });

  test('normalizes Firestore, Date, and numeric timestamps', () => {
    const date = new Date('2026-03-01T12:00:00Z');
    const timestampLike = {
      toDate: () => date,
    };

    expect(timestampToMs(date.getTime())).toBe(date.getTime());
    expect(timestampToMs(date)).toBe(date.getTime());
    expect(timestampToMs(timestampLike)).toBe(date.getTime());
    expect(timestampToMs('bad')).toBeNull();
  });

  test('computes rollback windows and formats import timestamps consistently', () => {
    const savedAtMs = Date.parse('2026-03-01T12:00:00Z');

    expect(getRollbackUntilMs(savedAtMs)).toBe(savedAtMs + ROLLBACK_WINDOW_MS);
    expect(formatImportTimestamp(savedAtMs)).toBe('2026-03-01 12:00:00 UTC');
  });

  test('allows rollback only while the rollback window is still open', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);

    expect(canRollback(1000)).toBe(true);
    expect(canRollback(999)).toBe(false);
    expect(canRollback(null)).toBe(false);

    nowSpy.mockRestore();
  });
});
