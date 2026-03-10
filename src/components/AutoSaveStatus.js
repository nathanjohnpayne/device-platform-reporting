import React from 'react';
import RollbackButton from './RollbackButton';
import { canRollback, formatImportTimestamp, ROLLBACK_WINDOW_DAYS } from '../utils/importHistory';

function renderMessage(status, importedAtMs, rollbackUntilMs, error) {
  if (status === 'saving') {
    return 'Saving this import to Firestore automatically...';
  }

  if (status === 'rollingBack') {
    return 'Rolling back this import...';
  }

  if (status === 'saved') {
    return `Imported automatically on ${formatImportTimestamp(importedAtMs)}. Rollback is available until ${formatImportTimestamp(rollbackUntilMs)}.`;
  }

  if (status === 'duplicate') {
    return `This dataset was already imported on ${formatImportTimestamp(importedAtMs)}. A second copy was not saved.`;
  }

  if (status === 'rolledBack') {
    return 'This import was rolled back. Upload the file again if you need to restore it.';
  }

  if (status === 'error') {
    return error || 'Automatic save failed.';
  }

  return '';
}

export default function AutoSaveStatus({
  label,
  status,
  error,
  importedAtMs,
  rollbackUntilMs,
  onRollback,
}) {
  if (status === 'idle') {
    return null;
  }

  const tone = {
    saving: 'alert-info',
    rollingBack: 'alert-warning',
    saved: 'alert-success',
    duplicate: 'alert-warning',
    rolledBack: 'alert-info',
    error: 'alert-error',
  }[status] || 'alert-info';

  const showRollback = (status === 'saved' || status === 'duplicate') && canRollback(rollbackUntilMs);

  return (
    <div className={`alert ${tone}`} style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 320px', minWidth: 0, lineHeight: 1.6 }}>
        <strong>{label}:</strong> {renderMessage(status, importedAtMs, rollbackUntilMs, error)}
        {(status === 'saved' || status === 'duplicate') && !showRollback && rollbackUntilMs && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {status === 'duplicate'
              ? `The original import from ${formatImportTimestamp(importedAtMs)} is no longer reversible.`
              : `Rollback expired after the shared ${ROLLBACK_WINDOW_DAYS}-day window.`}
          </div>
        )}
      </div>

      {showRollback && onRollback && (
        <div style={{ marginLeft: 'auto' }}>
          <RollbackButton
            subject={label.toLowerCase()}
            rollbackUntilMs={rollbackUntilMs}
            onConfirm={onRollback}
            disabled={status === 'rollingBack'}
            label="Roll back import"
          />
        </div>
      )}
    </div>
  );
}
