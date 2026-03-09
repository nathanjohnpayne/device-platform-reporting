// pages/AdkVersionManager.js
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy
} from 'firebase/firestore';

const EMPTY = {
  adkVersion: '',
  coreVersions: '',   // comma-separated list of core_version strings from Sentry
  releaseDate: '',
  features: '',
  notes: '',
};

const SEED_VERSIONS = [
  { adkVersion: 'ADK 3.1.1', coreVersions: '42.16,2025.09.8,2025.09.10', releaseDate: '2024-09-03', features: 'nve_plugin crash fix, crash reporting fix, subtitle display, root cert update', notes: 'Current GA' },
  { adkVersion: 'ADK 3.1.0', coreVersions: '42.15',   releaseDate: '2024-03-29', features: 'Encrypted audio, CNS', notes: '' },
  { adkVersion: 'ADK 3.0.1', coreVersions: '42.7.1',  releaseDate: '2023-07-27', features: 'Core patch: Background Mode segfault fix', notes: '' },
  { adkVersion: 'ADK 3.0',   coreVersions: '42.7.0',  releaseDate: '2023-04-28', features: 'See Confluence: ADK 3.0 Scope Overview', notes: '' },
  { adkVersion: 'ADK 2.1.2', coreVersions: '1.2.6',   releaseDate: '2022-06-13', features: 'QoE telemetry fixes', notes: '' },
  { adkVersion: 'ADK 2.1.1', coreVersions: '1.2.5',   releaseDate: '2022-03-18', features: 'Bug fixes, stability', notes: '' },
  { adkVersion: 'ADK 2.1',   coreVersions: '1.2.5',   releaseDate: '2022-01-24', features: 'Live video support, Star+ support', notes: '' },
  { adkVersion: 'ADK 2.0',   coreVersions: '1.2.4',   releaseDate: '2021-10-27', features: 'Star+ support incl. Live TV (not released)', notes: '' },
];

export default function AdkVersionManager() {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);   // null | 'add' | 'edit'
  const [form, setForm]         = useState(EMPTY);
  const [editId, setEditId]     = useState(null);
  const [saving, setSaving]     = useState(false);
  const [seeding, setSeeding]   = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'adkVersions'), orderBy('releaseDate', 'desc')));
      setVersions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd  = () => { setForm(EMPTY); setEditId(null); setModal('add'); };
  const openEdit = (v) => {
    setForm({ adkVersion: v.adkVersion, coreVersions: (v.coreVersions || []).join(', '), releaseDate: v.releaseDate, features: v.features || '', notes: v.notes || '' });
    setEditId(v.id);
    setModal('edit');
  };

  const save = async () => {
    if (!form.adkVersion.trim() || !form.coreVersions.trim()) return;
    setSaving(true);
    const payload = {
      adkVersion:   form.adkVersion.trim(),
      coreVersions: form.coreVersions.split(',').map(s => s.trim()).filter(Boolean),
      releaseDate:  form.releaseDate,
      features:     form.features.trim(),
      notes:        form.notes.trim(),
      updatedAt:    serverTimestamp(),
    };
    try {
      if (modal === 'add') {
        await addDoc(collection(db, 'adkVersions'), { ...payload, createdAt: serverTimestamp() });
      } else {
        await updateDoc(doc(db, 'adkVersions', editId), payload);
      }
      setModal(null);
      await load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try { await deleteDoc(doc(db, 'adkVersions', deleteConfirm)); await load(); } catch (e) { console.error(e); }
    setDeleteConfirm(null);
  };

  const seedData = async () => {
    setSeeding(true);
    try {
      for (const v of SEED_VERSIONS) {
        await addDoc(collection(db, 'adkVersions'), {
          ...v,
          coreVersions: v.coreVersions.split(',').map(s => s.trim()),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await load();
    } catch (e) { console.error(e); }
    setSeeding(false);
  };

  return (
    <div>
      <div className="section-header">
        <span className="section-badge badge-admin">Admin</span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>ADK Version Manager</h2>
      </div>

      <div className="instructions">
        <h4>ℹ️ About this table</h4>
        <ul>
          <li>This table maps Sentry's raw <code>core_version</code> strings (e.g., <code>42.16</code>, <code>2025.09.10</code>) to human-readable ADK version labels (e.g., <strong>ADK 3.1.1</strong>).</li>
          <li>It is used by <strong>ADK Version Share</strong> and <strong>Partner Migration</strong> workflows to translate Sentry data automatically.</li>
          <li><strong>Add a new entry whenever a new GA release is declared.</strong> You can find the core_version string in the Sentry ADK Partner–Device Combinations export after the release ships.</li>
          <li>Each ADK version can map to multiple core_version strings — enter them as a comma-separated list.</li>
        </ul>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="source-link" href="https://confluence.disney.com" target="_blank" rel="noreferrer">🔗 ADK Versions (Confluence)</a>
          <a className="source-link" href="https://disney.my.sentry.io/organizations/disney/explore/discover/results/?field=partner&field=device&field=core_version&field=count_unique%28device_id%29&field=count%28%29&sort=-count_unique_device_id&statsPeriod=24h" target="_blank" rel="noreferrer">🔗 Sentry: ADK Partner–Device Combos</a>
        </div>
      </div>

      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          {loading ? 'Loading…' : `${versions.length} version${versions.length !== 1 ? 's' : ''} in table`}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {versions.length === 0 && !loading && (
            <button className="btn btn-secondary" onClick={seedData} disabled={seeding}>
              {seeding ? <><span className="spinner" style={{ borderTopColor: '#334155' }} /> Seeding…</> : '🌱 Seed Initial Data'}
            </button>
          )}
          <button className="btn btn-primary" onClick={openAdd}>+ Add ADK Version</button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><div className="empty-state-icon">⏳</div><h3>Loading versions…</h3></div>
      ) : versions.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">📭</div>
          <h3>No ADK versions yet</h3>
          <p style={{ marginBottom: 16 }}>Click "Seed Initial Data" to load known versions, or add one manually.</p>
          <button className="btn btn-primary" onClick={openAdd}>+ Add ADK Version</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ADK Version</th>
                <th>core_version strings (Sentry)</th>
                <th>Release Date</th>
                <th>Features / Notes</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v, i) => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{v.adkVersion}</td>
                  <td>
                    {(v.coreVersions || []).map(cv => (
                      <span key={cv} className="tag" style={{ marginRight: 4, marginBottom: 2, display: 'inline-block' }}>{cv}</span>
                    ))}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>{v.releaseDate || '—'}</td>
                  <td style={{ fontSize: 12, color: '#475569', maxWidth: 280 }}>{v.features || '—'}</td>
                  <td>
                    {v.notes?.toLowerCase().includes('current') || v.notes?.toLowerCase().includes('ga')
                      ? <span className="chip chip-green">Current GA</span>
                      : <span className="chip chip-gray">Legacy</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(v)} style={{ marginRight: 6 }}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(v.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-title">{modal === 'add' ? '+ Add ADK Version' : '✏️ Edit ADK Version'}</div>

            <div className="form-group">
              <label className="form-label">ADK Version Label *</label>
              <input className="form-input" placeholder="e.g. ADK 4.0" value={form.adkVersion} onChange={e => setForm(f => ({ ...f, adkVersion: e.target.value }))} />
            </div>

            <div className="form-group">
              <label className="form-label">core_version strings (comma-separated) *</label>
              <input className="form-input" placeholder="e.g. 2025.09.10, 2025.09.8" value={form.coreVersions} onChange={e => setForm(f => ({ ...f, coreVersions: e.target.value }))} />
              <p className="text-muted" style={{ marginTop: 4 }}>These are the exact strings that appear in the Sentry <code>core_version</code> column. Multiple values for the same ADK release are fine.</p>
            </div>

            <div className="form-group">
              <label className="form-label">Release Date</label>
              <input className="form-input" type="date" value={form.releaseDate} onChange={e => setForm(f => ({ ...f, releaseDate: e.target.value }))} />
            </div>

            <div className="form-group">
              <label className="form-label">Features</label>
              <textarea className="form-input form-textarea" placeholder="Key features or changes in this release" value={form.features} onChange={e => setForm(f => ({ ...f, features: e.target.value }))} />
            </div>

            <div className="form-group">
              <label className="form-label">Notes (e.g., "Current GA")</label>
              <input className="form-input" placeholder="e.g. Current GA, Deprecated, Beta only" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.adkVersion.trim() || !form.coreVersions.trim()}>
                {saving ? <><span className="spinner" /> Saving…</> : modal === 'add' ? 'Add Version' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-title">⚠️ Delete Version?</div>
            <p style={{ fontSize: 14, color: '#475569', marginBottom: 20 }}>
              This will remove the ADK version mapping from Firestore. Partner migration and version share workflows will no longer map this core_version string. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
