import React, { useState } from 'react';
import ConfirmModal from './ConfirmModal';
import { canRollback, formatImportTimestamp, ROLLBACK_WINDOW_DAYS } from '../utils/importHistory';

export default function RollbackButton({
  subject = 'this import',
  rollbackUntilMs,
  onConfirm,
  onRolledBack,
  disabled = false,
  className = 'btn btn-danger btn-sm',
  label = 'Roll back',
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const eligible = canRollback(rollbackUntilMs);

  const handleConfirm = async () => {
    setBusy(true);
    setError('');

    try {
      await onConfirm?.();
      setOpen(false);
      onRolledBack?.();
    } catch (nextError) {
      setError(nextError.message || 'Unable to roll back this import.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className={className}
        onClick={() => eligible && setOpen(true)}
        disabled={disabled || busy || !eligible}
      >
        {busy ? 'Rolling back...' : eligible ? label : 'Rollback expired'}
      </button>

      {open && (
        <ConfirmModal
          title="Roll back import?"
          confirmLabel="Roll back"
          onConfirm={handleConfirm}
          onCancel={() => {
            if (!busy) {
              setError('');
              setOpen(false);
            }
          }}
          busy={busy}
        >
          <p style={{ marginTop: 0 }}>
            This will delete {subject} from Firestore and remove it from history. This action is destructive and cannot be undone.
          </p>
          <p style={{ marginBottom: 0 }}>
            Only imports from the last {ROLLBACK_WINDOW_DAYS} days can be rolled back. This window closes on {formatImportTimestamp(rollbackUntilMs)}.
          </p>
          {error && (
            <div className="alert alert-error" style={{ marginTop: 16, marginBottom: 0 }}>
              {error}
            </div>
          )}
        </ConfirmModal>
      )}
    </>
  );
}
