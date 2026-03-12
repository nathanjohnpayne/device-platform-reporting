import { useEffect, useRef, useState } from 'react';
import { canRollback, replaceImportSnapshot, rollbackImportSnapshot, saveImportSnapshot, timestampToMs, getRollbackUntilMs } from '../utils/importHistory';

const IDLE_STATE = {
  status: 'idle',
  error: '',
  batchId: '',
  importedAtMs: null,
  rollbackUntilMs: null,
  conflictData: null,
  conflictResolving: false,
};

export default function useAutoImport(request, requestKey, callbacks = {}) {
  const requestRef = useRef(request);
  const callbacksRef = useRef(callbacks);
  const [state, setState] = useState(IDLE_STATE);
  const stateRef = useRef(IDLE_STATE);

  const setTrackedState = (nextState) => {
    stateRef.current = typeof nextState === 'function' ? nextState(stateRef.current) : nextState;
    setState(stateRef.current);
  };

  requestRef.current = request;
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!requestKey || !requestRef.current) {
      setTrackedState(IDLE_STATE);
      return;
    }

    let cancelled = false;

    setTrackedState({
      ...IDLE_STATE,
      status: 'saving',
    });

    (async () => {
      try {
        const result = await saveImportSnapshot(requestRef.current);
        if (cancelled) return;

        if (result.status === 'conflict') {
          const existing = result.existingSnapshot;
          const existingAtMs = timestampToMs(existing.uploadedAt);
          setTrackedState({
            ...IDLE_STATE,
            status: 'conflict',
            conflictData: {
              existingSnapshot: existing,
              newSnapshotRequest: requestRef.current,
            },
            importedAtMs: existingAtMs,
            rollbackUntilMs: getRollbackUntilMs(existingAtMs),
          });
          callbacksRef.current.onConflict?.(result);
          return;
        }

        const nextState = {
          status: result.status === 'duplicate' ? 'duplicate' : 'saved',
          error: '',
          batchId: result.batch.id,
          importedAtMs: result.batch.importedAtMs,
          rollbackUntilMs: result.batch.rollbackUntilMs,
          conflictData: null,
          conflictResolving: false,
        };

        setTrackedState(nextState);

        if (result.status === 'duplicate') {
          callbacksRef.current.onDuplicate?.(result);
          return;
        }

        callbacksRef.current.onSaved?.(result);
      } catch (error) {
        if (cancelled) return;

        setTrackedState({
          ...IDLE_STATE,
          status: 'error',
          error: error.message || 'Automatic save failed.',
        });

        callbacksRef.current.onError?.(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const rollback = async () => {
    const currentState = stateRef.current;

    if (!currentState.batchId || currentState.status === 'rollingBack') {
      return null;
    }

    const previousState = currentState;

    setTrackedState((current) => ({
      ...current,
      status: 'rollingBack',
      error: '',
    }));

    try {
      const result = await rollbackImportSnapshot(currentState.batchId);

      setTrackedState({
        ...IDLE_STATE,
        status: 'rolledBack',
      });

      callbacksRef.current.onRolledBack?.(result);
      return result;
    } catch (error) {
      setTrackedState({
        ...previousState,
        error: error.message || 'Unable to roll back this import.',
      });

      callbacksRef.current.onRollbackError?.(error);
      throw error;
    }
  };

  const resolveConflict = async (choice) => {
    const currentState = stateRef.current;
    if (currentState.status !== 'conflict' || !currentState.conflictData) return;

    const { existingSnapshot, newSnapshotRequest } = currentState.conflictData;

    if (choice === 'keep') {
      const existingAtMs = timestampToMs(existingSnapshot.uploadedAt);
      setTrackedState({
        ...IDLE_STATE,
        status: 'duplicate',
        batchId: existingSnapshot.importBatchId || '',
        importedAtMs: existingAtMs,
        rollbackUntilMs: getRollbackUntilMs(existingAtMs),
      });
      return;
    }

    // choice === 'replace'
    setTrackedState((s) => ({ ...s, conflictResolving: true }));

    try {
      const result = await replaceImportSnapshot({
        existingCollectionName: newSnapshotRequest.collectionName,
        existingSnapshotId: existingSnapshot.id,
        existingBatchId: existingSnapshot.importBatchId || null,
        newRequest: newSnapshotRequest,
      });

      setTrackedState({
        ...IDLE_STATE,
        status: 'saved',
        batchId: result.batch.id,
        importedAtMs: result.batch.importedAtMs,
        rollbackUntilMs: result.batch.rollbackUntilMs,
      });

      callbacksRef.current.onSaved?.(result);
    } catch (err) {
      setTrackedState((s) => ({
        ...s,
        conflictResolving: false,
        error: err.message || 'Failed to replace the existing snapshot.',
      }));
    }
  };

  return {
    ...state,
    canRollback: canRollback(state.rollbackUntilMs),
    rollback,
    resolveConflict,
  };
}
