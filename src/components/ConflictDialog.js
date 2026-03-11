import React from 'react';
import { formatImportTimestamp } from '../utils/importHistory';

function SnapshotColumn({ heading, snapshot, summary }) {
  const uploadedAtMs = snapshot?.importedAtMs
    || (snapshot?.uploadedAt?.toDate ? snapshot.uploadedAt.toDate().getTime() : null);
  const files = (snapshot?.sourceFiles || (summary?.sourceFiles) || []).join(', ') || '—';
  const rowCount = snapshot?.rawRows?.length ?? snapshot?.summary?.rowCount ?? summary?.rowCount ?? '—';
  const partnerCount = snapshot?.partners?.length ?? snapshot?.summary?.partnerCount ?? summary?.partnerCount ?? null;

  return (
    <div style={{ flex: '1 1 0', padding: '12px 16px', background: '#f8fafc', borderRadius: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#0f2744' }}>{heading}</div>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 13 }}>
        <dt style={{ color: '#64748b', fontWeight: 500 }}>Uploaded</dt>
        <dd style={{ margin: 0, color: '#1e293b' }}>{formatImportTimestamp(uploadedAtMs)}</dd>
        <dt style={{ color: '#64748b', fontWeight: 500 }}>File(s)</dt>
        <dd style={{ margin: 0, color: '#1e293b', wordBreak: 'break-all' }}>{files}</dd>
        <dt style={{ color: '#64748b', fontWeight: 500 }}>Rows</dt>
        <dd style={{ margin: 0, color: '#1e293b' }}>{typeof rowCount === 'number' ? rowCount.toLocaleString() : rowCount}</dd>
        {partnerCount != null && (
          <>
            <dt style={{ color: '#64748b', fontWeight: 500 }}>Partners</dt>
            <dd style={{ margin: 0, color: '#1e293b' }}>{partnerCount}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export default function ConflictDialog({ existingSnapshot, newSnapshotRequest, onKeep, onReplace, busy }) {
  if (!existingSnapshot) return null;

  const newSummary = newSnapshotRequest?.summary || {};
  const newSourceFiles = newSnapshotRequest?.sourceFiles || [];

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560, width: '100%' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: '#0f2744' }}>
          ⚠️ Duplicate Time Period
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
          A snapshot already exists for this period. Keep the existing upload or replace it with the new one.
          Replacing will mark the existing snapshot as superseded.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <SnapshotColumn
            heading="Existing snapshot"
            snapshot={existingSnapshot}
            summary={existingSnapshot.summary}
          />
          <SnapshotColumn
            heading="New upload"
            snapshot={{ sourceFiles: newSourceFiles, importedAtMs: null }}
            summary={{ ...newSummary, sourceFiles: newSourceFiles }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            className="btn btn-secondary"
            onClick={onKeep}
            disabled={busy}
          >
            Keep existing
          </button>
          <button
            className="btn btn-danger"
            onClick={onReplace}
            disabled={busy}
          >
            {busy ? 'Replacing…' : 'Use new upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
