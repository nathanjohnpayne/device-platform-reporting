import React from 'react';

export default function ConfirmModal({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmClassName = 'btn btn-danger',
  onConfirm,
  onCancel,
  busy = false,
}) {
  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-title">{title}</div>
        <div style={{ fontSize: 14, color: '#475569', marginBottom: 20, lineHeight: 1.6 }}>
          {children}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={confirmClassName} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
