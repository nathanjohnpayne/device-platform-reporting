import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

export const ROLLBACK_WINDOW_DAYS = 30;
export const ROLLBACK_WINDOW_MS = ROLLBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function normalizeForHash(value) {
  if (value == null) return null;

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        const nextValue = normalizeForHash(value[key]);
        if (nextValue !== undefined) acc[key] = nextValue;
        return acc;
      }, {});
  }

  if (typeof value === 'number' && Number.isNaN(value)) {
    return null;
  }

  return value;
}

function fallbackHash(input) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return Math.abs(hash >>> 0).toString(16).padStart(8, '0');
}

async function digestText(input) {
  if (!globalThis.crypto?.subtle) {
    return fallbackHash(input);
  }

  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildImportBatchId(type, payload) {
  const normalized = JSON.stringify({
    type,
    payload: normalizeForHash(payload),
  });

  return `${type}-${await digestText(normalized)}`;
}

export function canRollback(rollbackUntilMs) {
  return Number.isFinite(rollbackUntilMs) && Date.now() <= rollbackUntilMs;
}

export function formatImportTimestamp(timestampMs) {
  if (!timestampMs) return 'Unknown time';
  return new Date(timestampMs).toLocaleString();
}

export async function saveImportSnapshot({
  type,
  label,
  collectionName,
  data,
  fingerprintData,
  sourceFiles = [],
  summary = {},
}) {
  const normalizedSourceFiles = [...new Set((sourceFiles || []).filter(Boolean))].sort();
  const batchId = await buildImportBatchId(type, fingerprintData);
  const batchRef = doc(db, 'importBatches', batchId);
  const existingBatch = await getDoc(batchRef);

  if (existingBatch.exists()) {
    return {
      status: 'duplicate',
      batchId,
      batch: {
        id: existingBatch.id,
        ...existingBatch.data(),
      },
    };
  }

  const importedAtMs = Date.now();
  const rollbackUntilMs = importedAtMs + ROLLBACK_WINDOW_MS;
  const snapshotRef = doc(collection(db, collectionName), batchId);
  const snapshotData = {
    ...data,
    importBatchId: batchId,
    importLabel: label,
    importedAtMs,
    rollbackUntilMs,
    sourceFiles: normalizedSourceFiles,
    uploadedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);

  batch.set(snapshotRef, snapshotData);
  batch.set(batchRef, {
    type,
    label,
    collectionName,
    snapshotId: snapshotRef.id,
    importedAt: serverTimestamp(),
    importedAtMs,
    rollbackUntilMs,
    sourceFiles: normalizedSourceFiles,
    summary,
  });

  await batch.commit();

  return {
    status: 'saved',
    batchId,
    batch: {
      id: batchId,
      type,
      label,
      collectionName,
      snapshotId: snapshotRef.id,
      importedAtMs,
      rollbackUntilMs,
      sourceFiles: normalizedSourceFiles,
      summary,
    },
    snapshot: {
      id: snapshotRef.id,
      ...data,
      importBatchId: batchId,
      importLabel: label,
      importedAtMs,
      rollbackUntilMs,
      sourceFiles: normalizedSourceFiles,
    },
  };
}

export async function rollbackImportSnapshot(batchId) {
  const batchRef = doc(db, 'importBatches', batchId);
  const batchSnap = await getDoc(batchRef);

  if (!batchSnap.exists()) {
    throw new Error('This import is no longer available to roll back.');
  }

  const batchData = batchSnap.data();

  if (!canRollback(batchData.rollbackUntilMs)) {
    throw new Error(`Only imports from the last ${ROLLBACK_WINDOW_DAYS} days can be rolled back.`);
  }

  const batch = writeBatch(db);
  batch.delete(doc(db, batchData.collectionName, batchData.snapshotId || batchId));
  batch.delete(batchRef);
  await batch.commit();

  return {
    id: batchId,
    ...batchData,
  };
}
