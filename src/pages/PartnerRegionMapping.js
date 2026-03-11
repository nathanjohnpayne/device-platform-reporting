import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import UploadZone from '../components/UploadZone';
import { auth, db } from '../firebase';
import {
  PARTNER_REGION_SHEET_URL,
  parsePartnerRegionMappingCsv,
} from '../utils/partnerRegionMapping';
import { formatImportTimestamp, timestampToMs } from '../utils/importHistory';

function buildCreatorFields() {
  return {
    createdByUid: auth.currentUser?.uid || '',
    createdByEmail: auth.currentUser?.email || '',
  };
}

function sortMappings(rows = []) {
  return [...rows].sort((left, right) => (
    String(left.friendlyPartnerName || left.partnerKey || '').localeCompare(String(right.friendlyPartnerName || right.partnerKey || ''))
  ));
}

export default function PartnerRegionMapping() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const [metaSnap, rowsSnap] = await Promise.all([
        getDoc(doc(db, 'partnerRegionMappingMeta', 'current')),
        getDocs(collection(db, 'partnerRegionMappings')),
      ]);

      setMeta(metaSnap.exists() ? metaSnap.data() : null);
      setRows(sortMappings(rowsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError.message || 'Unable to load the partner-region mapping.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedSearch = String(search || '').trim().toLowerCase();
    if (!normalizedSearch) return rows;

    return rows.filter((row) => (
      row.partnerKey?.toLowerCase().includes(normalizedSearch)
      || row.friendlyPartnerName?.toLowerCase().includes(normalizedSearch)
      || row.regionsOperate?.toLowerCase().includes(normalizedSearch)
      || row.dashboardAliases?.some((alias) => alias.toLowerCase().includes(normalizedSearch))
    ));
  }, [rows, search]);

  const handleUpload = async (file) => {
    setSaving(true);
    setError('');

    try {
      const text = await file.text();
      const parsed = parsePartnerRegionMappingCsv(text);
      const creatorFields = buildCreatorFields();
      const existingSnap = await getDocs(collection(db, 'partnerRegionMappings'));
      const batches = [];
      let batch = writeBatch(db);
      let operationCount = 0;

      const queueOperation = (callback) => {
        if (operationCount === 450) {
          batches.push(batch.commit());
          batch = writeBatch(db);
          operationCount = 0;
        }

        callback(batch);
        operationCount += 1;
      };

      existingSnap.docs.forEach((docSnap) => {
        queueOperation((currentBatch) => currentBatch.delete(docSnap.ref));
      });

      parsed.rows.forEach((row, index) => {
        const rowRef = doc(db, 'partnerRegionMappings', row.id);
        queueOperation((currentBatch) => {
          currentBatch.set(rowRef, {
            ...row,
            rowOrder: index,
            sourceFileName: file.name,
            importedAt: serverTimestamp(),
            ...creatorFields,
          });
        });
      });

      queueOperation((currentBatch) => {
        currentBatch.set(doc(db, 'partnerRegionMappingMeta', 'current'), {
          sourceFileName: file.name,
          rowCount: parsed.rowCount,
          aliasCount: parsed.aliasCount,
          importedAt: serverTimestamp(),
          ...creatorFields,
        });
      });

      batches.push(batch.commit());
      await Promise.all(batches);
      await load();

      return {
        status: 'ok',
        message: `${parsed.rowCount} partner mappings imported from ${file.name}`,
      };
    } catch (uploadError) {
      console.error(uploadError);
      setError(uploadError.message || 'Unable to import the partner mapping CSV.');
      throw uploadError;
    } finally {
      setSaving(false);
    }
  };

  const importedAtMs = timestampToMs(meta?.importedAt);

  return (
    <div>
      <div className="section-header">
        <span className="section-badge badge-admin">Admin</span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>Partner Region Mapping</h2>
      </div>

      <div className="instructions">
        <h4>ℹ️ How to update the mapping</h4>
        <ol>
          <li>Open the shared <a href={PARTNER_REGION_SHEET_URL} target="_blank" rel="noreferrer">Partner Country + Region mapping sheet</a>.</li>
          <li>Make changes in <strong>Sheet 1</strong> only, then export Sheet 1 as CSV.</li>
          <li>Upload that CSV below to replace the mapping used by the monthly regional estimation model.</li>
          <li>Use the optional <code>dashboard_aliases</code> column for comma-separated Looker labels that do not exactly match <code>partner_key</code> or <code>friendly_partner_name</code>.</li>
        </ol>
      </div>

      <div className="card">
        <div className="card-title">Upload Mapping CSV</div>
        <div className="card-subtitle">Required columns: partner_key, friendly_partner_name, countries_operate_iso2, regions_operate. Blank trailing export columns are ignored.</div>
        <UploadZone
          label={saving ? 'Importing mapping CSV…' : 'Drop partner mapping CSV here'}
          hint="Export Sheet 1 as CSV, then upload it here"
          onFileSelected={handleUpload}
        />
        {error && (
          <div className="alert alert-error" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-subtitle">Current import</div>
          <div className="card-title" style={{ marginBottom: 0 }}>{meta?.sourceFileName || 'No mapping imported yet'}</div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-subtitle">Imported at</div>
          <div className="card-title" style={{ marginBottom: 0 }}>{importedAtMs ? formatImportTimestamp(importedAtMs) : '—'}</div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-subtitle">Rows</div>
          <div className="card-title" style={{ marginBottom: 0 }}>{meta?.rowCount ?? rows.length}</div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-subtitle">Aliases</div>
          <div className="card-title" style={{ marginBottom: 0 }}>{meta?.aliasCount ?? rows.reduce((sum, row) => sum + (row.dashboardAliases?.length || 0), 0)}</div>
        </div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ gap: 16, marginBottom: 16, alignItems: 'flex-end' }}>
          <div>
            <div className="card-title">Current Mapping Table</div>
            <div className="card-subtitle">
              {loading ? 'Loading…' : `${filteredRows.length} visible row${filteredRows.length === 1 ? '' : 's'}${search ? ` of ${rows.length}` : ''}`}
            </div>
          </div>
          <div style={{ minWidth: 280, flex: '0 1 320px' }}>
            <label className="form-label" htmlFor="partner-region-search">Search</label>
            <input
              id="partner-region-search"
              className="form-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Partner key, name, region, or alias"
            />
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <h3>Loading partner mapping…</h3>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>No partner mapping imported</h3>
            <p>Export Sheet 1 from the Google Sheet and upload it above to enable regional estimation.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Partner Key</th>
                  <th>Friendly Name</th>
                  <th>Countries</th>
                  <th>Regions Operate</th>
                  <th>Resolved Region</th>
                  <th>Dashboard Aliases</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.partnerKey || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{row.friendlyPartnerName}</td>
                    <td>{row.countriesOperateIso2?.join(', ') || '—'}</td>
                    <td>{row.regionsOperate || '—'}</td>
                    <td>
                      {row.resolvedRegion
                        ? <span className="chip chip-green">{row.resolvedRegion}</span>
                        : <span className="chip chip-gray">Global / Unmapped</span>}
                    </td>
                    <td>{row.dashboardAliases?.length ? row.dashboardAliases.join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
