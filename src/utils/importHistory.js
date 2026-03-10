import { collection, doc, getDoc, getDocFromServer, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';

// Shared policy: recent imports stay user-reversible for 30 days.
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
  // Duplicate detection is content-based so the same dataset is blocked even if it is re-exported under a new filename.
  const normalized = JSON.stringify({
    type,
    payload: normalizeForHash(payload),
  });

  return `${type}-${await digestText(normalized)}`;
}

export function timestampToMs(value) {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value?.toDate) return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return null;
}

export function getRollbackUntilMs(importedAtValue) {
  const importedAtMs = timestampToMs(importedAtValue);
  return importedAtMs ? importedAtMs + ROLLBACK_WINDOW_MS : null;
}

export function canRollback(rollbackUntilMs) {
  return Number.isFinite(rollbackUntilMs) && Date.now() <= rollbackUntilMs;
}

export function formatImportTimestamp(timestampMs) {
  if (!timestampMs) return 'Unknown time';
  return new Date(timestampMs).toISOString().replace(/\.\d{3}Z$/, ' UTC').replace('T', ' ');
}

function buildCreatorFields() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('You must be signed in to save or roll back imports.');
  }

  return {
    createdByUid: currentUser.uid,
    createdByEmail: currentUser.email || '',
  };
}

function hydrateBatch(batchId, batchData = {}) {
  const importedAtMs = timestampToMs(batchData.importedAt || batchData.uploadedAt || batchData.importedAtMs);

  return {
    id: batchId,
    ...batchData,
    importedAtMs,
    rollbackUntilMs: getRollbackUntilMs(importedAtMs),
  };
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
      batch: hydrateBatch(existingBatch.id, existingBatch.data()),
    };
  }

  const creatorFields = buildCreatorFields();
  const snapshotRef = doc(collection(db, collectionName), batchId);
  const snapshotData = {
    ...data,
    importBatchId: batchId,
    importLabel: label,
    importFingerprint: batchId,
    sourceFiles: normalizedSourceFiles,
    ...creatorFields,
    uploadedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);

  batch.set(snapshotRef, snapshotData);
  batch.set(batchRef, {
    type,
    label,
    collectionName,
    snapshotId: snapshotRef.id,
    importFingerprint: batchId,
    importedAt: serverTimestamp(),
    sourceFiles: normalizedSourceFiles,
    summary,
    ...creatorFields,
  });

  await batch.commit();

  let savedBatchSnap = null;

  try {
    savedBatchSnap = await getDocFromServer(batchRef);
  } catch (error) {
    savedBatchSnap = await getDoc(batchRef);
  }

  const hydratedBatch = hydrateBatch(savedBatchSnap.id, savedBatchSnap.data());

  return {
    status: 'saved',
    batchId,
    batch: hydratedBatch,
    snapshot: {
      id: snapshotRef.id,
      ...data,
      importBatchId: batchId,
      importLabel: label,
      importFingerprint: batchId,
      sourceFiles: normalizedSourceFiles,
      ...creatorFields,
      uploadedAt: savedBatchSnap.data()?.importedAt || null,
      importedAtMs: hydratedBatch.importedAtMs,
      rollbackUntilMs: hydratedBatch.rollbackUntilMs,
    },
  };
}

export async function rollbackImportSnapshot(batchId) {
  const batchRef = doc(db, 'importBatches', batchId);
  const batchSnap = await getDoc(batchRef);

  if (!batchSnap.exists()) {
    throw new Error('This import is no longer available to roll back.');
  }

  const batchData = hydrateBatch(batchSnap.id, batchSnap.data());

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
