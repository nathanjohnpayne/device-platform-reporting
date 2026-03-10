import { useEffect, useRef, useState } from 'react';
import { canRollback, rollbackImportSnapshot, saveImportSnapshot } from '../utils/importHistory';

const IDLE_STATE = {
  status: 'idle',
  error: '',
  batchId: '',
  importedAtMs: null,
  rollbackUntilMs: null,
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

        const nextState = {
          status: result.status === 'duplicate' ? 'duplicate' : 'saved',
          error: '',
          batchId: result.batch.id,
          importedAtMs: result.batch.importedAtMs,
          rollbackUntilMs: result.batch.rollbackUntilMs,
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

  return {
    ...state,
    canRollback: canRollback(state.rollbackUntilMs),
    rollback,
  };
}
