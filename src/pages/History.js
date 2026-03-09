// pages/History.js
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

function HistoryTable({ title, collectionName, columns }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(db, collectionName), orderBy('uploadedAt', 'desc'), limit(50)))
      .then(snap => { setRows(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); })
      .catch(() => setLoading(false));
  }, [collectionName]);

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="card-subtitle">{loading ? 'Loading…' : `${rows.length} record${rows.length !== 1 ? 's' : ''} (most recent 50)`}</div>
      {!loading && rows.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 0' }}>
          <div className="empty-state-icon">📭</div>
          <h3>No data yet</h3>
          <p>Records appear here after you complete a workflow and click "Save to History."</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                {columns.map(c => <th key={c.key}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  {columns.map(c => (
                    <td key={c.key}>
                      {c.render ? c.render(r) : (r[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function History() {
  return (
    <div>
      <div className="section-header">
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>🗂️ Historical Data</h2>
      </div>

      <div className="alert alert-info">
        ℹ️ All records saved via the weekly and monthly workflows appear here. Data is stored in Firestore and shared across all authenticated users.
      </div>

      <HistoryTable
        title="📊 Playback Performance — Weekly Snapshots"
        collectionName="weeklySnapshots"
        columns={[
          { key: 'weekOf',    label: 'Week Of' },
          { key: 'type',      label: 'Type' },
          { key: 'uploadedAt', label: 'Uploaded', render: r => r.uploadedAt?.toDate?.().toLocaleString() || '—' },
          { key: 'rows', label: 'Rows', render: r => r.rows?.length ?? '—' },
        ]}
      />

      <HistoryTable
        title="🥧 ADK Version Share — Weekly"
        collectionName="adkVersionShare"
        columns={[
          { key: 'weekOf', label: 'Week Of' },
          { key: 'shares', label: 'Versions', render: r => (r.shares || []).map(s => `${s.name}: ${s.pct}`).join(' · ') || '—' },
          { key: 'uploadedAt', label: 'Uploaded', render: r => r.uploadedAt?.toDate?.().toLocaleString() || '—' },
        ]}
      />

      <HistoryTable
        title="🔄 Partner Migration — Weekly"
        collectionName="partnerMigration"
        columns={[
          { key: 'weekOf', label: 'Week Of' },
          { key: 'partners', label: 'Partners', render: r => `${r.partners?.length ?? 0} partners tracked` },
          { key: 'partners', label: 'Not Migrated', render: r => `${r.partners?.filter(p => parseFloat(p.legacyPct) > 0).length ?? 0} with legacy ADK` },
          { key: 'uploadedAt', label: 'Uploaded', render: r => r.uploadedAt?.toDate?.().toLocaleString() || '—' },
        ]}
      />

      <HistoryTable
        title="📈 Monthly Snapshots (Platform & Regional KPIs)"
        collectionName="monthlySnapshots"
        columns={[
          { key: 'month', label: 'Month' },
          { key: 'type',  label: 'Type', render: r => r.type === 'platformKpis' ? 'Platform KPIs' : 'Regional KPIs' },
          { key: 'uploadedAt', label: 'Uploaded', render: r => r.uploadedAt?.toDate?.().toLocaleString() || '—' },
        ]}
      />
    </div>
  );
}
