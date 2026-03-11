import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import RollbackButton from '../components/RollbackButton';
import UploadZone from '../components/UploadZone';
import { auth, db } from '../firebase';
import { buildAdkVersionMap } from '../utils/adk';
import { buildImportBatchId, canRollback, formatImportTimestamp, getRollbackUntilMs, ROLLBACK_WINDOW_DAYS } from '../utils/importHistory';
import {
  buildImportSummary,
  buildLegacyWorkbook,
  csvTextToRows,
  LEGACY_WORKBOOK_TYPES,
  PROGRAM_WORKBOOK_SHEETS,
  downloadWorkbook,
  isBurnDownWorkbookSheetSet,
  isProgramWorkbookSheetSet,
  readWorkbookFile,
  rowsToCsvText,
} from '../utils/legacyWorkbooks';

function workbookLabelForType(workbookType) {
  return workbookType === LEGACY_WORKBOOK_TYPES.program ? 'Program Weekly KPIs' : 'ADK Adoption Burn Down';
}

function getImportedAtMs(importRecord) {
  if (!importRecord) return null;
  if (importRecord.importedAtMs) return importRecord.importedAtMs;
  if (importRecord.importedAt?.toDate) return importRecord.importedAt.toDate().getTime();
  if (importRecord.importedAt instanceof Date) return importRecord.importedAt.getTime();
  return null;
}

function workbookFilename(prefix) {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix} ${date}.xlsx`;
}

export default function LegacyWorkbookSync() {
  const [imports, setImports] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [snapshotCounts, setSnapshotCounts] = useState({
    monthlySnapshots: 0,
    adkVersionShare: 0,
    partnerMigration: 0,
    exportablePlatform: 0,
    exportablePartner: 0,
  });

  const refreshStatus = async () => {
    setLoading(true);

    try {
      const [importSnap, monthlySnap, shareSnap, partnerSnap] = await Promise.all([
        getDocs(collection(db, 'legacyWorkbookImports')),
        getDocs(collection(db, 'monthlySnapshots')),
        getDocs(collection(db, 'adkVersionShare')),
        getDocs(collection(db, 'partnerMigration')),
      ]);

      setImports(Object.fromEntries(importSnap.docs.map((docSnap) => [docSnap.id, docSnap.data()])));

      const monthlyDocs = monthlySnap.docs.map((docSnap) => docSnap.data());
      const partnerDocs = partnerSnap.docs.map((docSnap) => docSnap.data());

      setSnapshotCounts({
        monthlySnapshots: monthlyDocs.length,
        adkVersionShare: shareSnap.size,
        partnerMigration: partnerDocs.length,
        exportablePlatform: monthlyDocs.filter((docSnap) => docSnap.type === 'platformKpis' && docSnap.legacyWorkbook?.platform).length,
        exportablePartner: partnerDocs.filter((docSnap) => docSnap.rawRows?.length).length,
      });
    } catch (nextError) {
      setError(nextError.message || 'Unable to load workbook sync status.');
    }

    setLoading(false);
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const importWorkbook = (workbookType) => async (file) => {
    setBusy(workbookType);
    setStatus('');
    setError('');

    try {
      const workbook = await readWorkbookFile(file);
      if (workbookType === LEGACY_WORKBOOK_TYPES.program && !isProgramWorkbookSheetSet(workbook.sheetNames)) {
        throw new Error(`Program workbook must include these sheets: ${PROGRAM_WORKBOOK_SHEETS.join(', ')}`);
      }
      if (workbookType === LEGACY_WORKBOOK_TYPES.burnDown && !isBurnDownWorkbookSheetSet(workbook.sheets)) {
        throw new Error('Burn down workbook must include at least one non-empty sheet.');
      }

      const sheetPayloads = workbook.sheets.map((sheet) => ({
        sheetName: sheet.sheetName,
        sheetOrder: sheet.sheetOrder,
        csvText: rowsToCsvText(sheet.rows),
        rowCount: sheet.rows.length,
        columnCount: Math.max(...sheet.rows.map((row) => row.length), 0),
      }));
      const batchId = await buildImportBatchId(`legacyWorkbook:${workbookType}`, {
        workbookType,
        sheets: sheetPayloads,
      });
      const importRef = doc(db, 'legacyWorkbookImports', workbookType);
      const currentImportSnap = await getDoc(importRef);
      const currentImport = currentImportSnap.exists() ? currentImportSnap.data() : null;
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('You must be signed in to import a workbook.');
      }

      if (currentImport?.batchId === batchId) {
        return {
          status: 'error',
          message: `${file.name} has already been imported for ${workbookLabelForType(workbookType)}.`,
        };
      }

      const workbookLabel = workbookLabelForType(workbookType);
      const creatorFields = {
        createdByUid: currentUser.uid,
        createdByEmail: currentUser.email || '',
      };
      const batch = writeBatch(db);

      sheetPayloads.forEach((sheet) => {
        batch.set(doc(db, 'legacyWorkbookSheets', `${batchId}::${sheet.sheetName}`), {
          workbookType,
          batchId,
          batchKey: `${workbookType}::${batchId}`,
          sheetName: sheet.sheetName,
          sheetOrder: sheet.sheetOrder,
          sourceFileName: file.name,
          csvText: sheet.csvText,
          rowCount: sheet.rowCount,
          columnCount: sheet.columnCount,
          importedAt: serverTimestamp(),
          ...creatorFields,
        });
      });

      const manifest = {
        batchId,
        workbookType,
        workbookLabel,
        sourceFileName: file.name,
        sheetCount: workbook.sheets.length,
        sheetNames: workbook.sheetNames,
        importedAt: serverTimestamp(),
        previousBatchId: currentImport?.batchId || null,
        previousImport: currentImport || null,
        ...creatorFields,
      };

      batch.set(doc(db, 'legacyWorkbookImportBatches', batchId), manifest);
      batch.set(importRef, manifest);

      await batch.commit();
      await refreshStatus();

      setStatus(`${buildImportSummary(workbookType, workbook.sheets)} Rollback is available for 90 days.`);

      return {
        status: 'ok',
        message: `${workbook.sheets.length} sheet${workbook.sheets.length === 1 ? '' : 's'} imported from ${file.name}`,
      };
    } catch (nextError) {
      setError(nextError.message || 'Unable to import workbook.');
      throw nextError;
    } finally {
      setBusy('');
    }
  };

  const rollbackWorkbookImport = (workbookType) => async () => {
    setBusy(`rollback:${workbookType}`);
    setStatus('');
    setError('');

    try {
      const importRef = doc(db, 'legacyWorkbookImports', workbookType);
      const currentImportSnap = await getDoc(importRef);

      if (!currentImportSnap.exists()) {
        throw new Error('There is no active workbook import to roll back.');
      }

      const currentImport = currentImportSnap.data();
      const rollbackUntilMs = getRollbackUntilMs(getImportedAtMs(currentImport));

      if (!currentImport.createdByUid) {
        throw new Error('Rollback is only available for workbook imports created after this feature was added.');
      }

      if (!canRollback(rollbackUntilMs)) {
        throw new Error('Only workbook imports from the last 90 days can be rolled back.');
      }

      const batch = writeBatch(db);

      if (currentImport.previousBatchId) {
        const previousBatchSnap = await getDoc(doc(db, 'legacyWorkbookImportBatches', currentImport.previousBatchId));

        if (!previousBatchSnap.exists()) {
          throw new Error('The previous workbook baseline could not be found.');
        }

        batch.set(importRef, previousBatchSnap.data());
      } else if (currentImport.previousImport) {
        batch.set(importRef, currentImport.previousImport);
      } else {
        // This was the first baseline ever imported for this workbook type, so rollback
        // intentionally clears the active manifest instead of restoring a prior version.
        batch.delete(importRef);
      }

      await batch.commit();
      await refreshStatus();

      setStatus(
        currentImport.previousBatchId
          ? `${workbookLabelForType(workbookType)} rolled back to the previous baseline batch.`
          : currentImport.previousImport
            ? `${workbookLabelForType(workbookType)} rolled back to the prior manifest snapshot.`
          : `${workbookLabelForType(workbookType)} rolled back. No baseline import is active now.`
      );
    } catch (nextError) {
      setError(nextError.message || 'Unable to roll back workbook import.');
      throw nextError;
    } finally {
      setBusy('');
    }
  };

  const exportWorkbook = async (workbookType) => {
    setBusy(`export:${workbookType}`);
    setStatus('');
    setError('');

    try {
      const currentImportSnap = await getDoc(doc(db, 'legacyWorkbookImports', workbookType));

      if (!currentImportSnap.exists()) {
        throw new Error('Import a baseline workbook before exporting a merged file.');
      }

      const currentImport = currentImportSnap.data();
      const [sheetSnap, monthlySnap, shareSnap, partnerSnap, adkSnap] = await Promise.all([
        currentImport.batchId
          ? getDocs(query(collection(db, 'legacyWorkbookSheets'), where('batchKey', '==', `${workbookType}::${currentImport.batchId}`)))
          : getDocs(query(collection(db, 'legacyWorkbookSheets'), where('workbookType', '==', workbookType))),
        getDocs(collection(db, 'monthlySnapshots')),
        getDocs(collection(db, 'adkVersionShare')),
        getDocs(collection(db, 'partnerMigration')),
        getDocs(collection(db, 'adkVersions')),
      ]);

      const importedSheets = sheetSnap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((left, right) => (left.sheetOrder || 0) - (right.sheetOrder || 0));

      const monthlySnapshots = monthlySnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const shareSnapshots = shareSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const partnerSnapshots = partnerSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const adkMap = buildAdkVersionMap(adkSnap.docs.map((docSnap) => docSnap.data()));

      const workbook = buildLegacyWorkbook(workbookType, {
        importedProgramSheets: Object.fromEntries(importedSheets.map((sheet) => [sheet.sheetName, csvTextToRows(sheet.csvText)])),
        importedBurnDownSheets: importedSheets,
        monthlySnapshots,
        shareSnapshots,
        partnerSnapshots,
        adkMap,
      });

      downloadWorkbook(
        workbook,
        workbookType === LEGACY_WORKBOOK_TYPES.program
          ? workbookFilename('NCP+ADK Program Weekly KPIs')
          : workbookFilename('ADK Adoption Burn Down')
      );

      setStatus(
        workbookType === LEGACY_WORKBOOK_TYPES.program
          ? 'Program workbook exported with imported baseline + app-collected history.'
          : 'Burn down workbook exported with imported baseline + saved Sentry history.'
      );
    } catch (nextError) {
      setError(nextError.message || 'Unable to export workbook.');
    } finally {
      setBusy('');
    }
  };

  const importCards = useMemo(() => ([
    {
      key: LEGACY_WORKBOOK_TYPES.program,
      title: 'Program Weekly KPIs Workbook',
      subtitle: 'Import the existing spreadsheet that contains Active Users, Active Devices, Total Playback Hours, ADK Version Share, Regional KPIs, and supporting tabs.',
      label: 'Drop Program KPI workbook here',
      filename: imports[LEGACY_WORKBOOK_TYPES.program]?.sourceFileName,
      importedAtMs: getImportedAtMs(imports[LEGACY_WORKBOOK_TYPES.program]),
      rollbackUntilMs: getRollbackUntilMs(getImportedAtMs(imports[LEGACY_WORKBOOK_TYPES.program])),
      rollbackEnabled: Boolean(imports[LEGACY_WORKBOOK_TYPES.program]?.createdByUid),
    },
    {
      key: LEGACY_WORKBOOK_TYPES.burnDown,
      title: 'ADK Adoption Burn Down Workbook',
      subtitle: 'Import the historical Discover workbook so the app can append new weekly Sentry exports back into the same file family.',
      label: 'Drop Burn Down workbook here',
      filename: imports[LEGACY_WORKBOOK_TYPES.burnDown]?.sourceFileName,
      importedAtMs: getImportedAtMs(imports[LEGACY_WORKBOOK_TYPES.burnDown]),
      rollbackUntilMs: getRollbackUntilMs(getImportedAtMs(imports[LEGACY_WORKBOOK_TYPES.burnDown])),
      rollbackEnabled: Boolean(imports[LEGACY_WORKBOOK_TYPES.burnDown]?.createdByUid),
    },
  ]), [imports]);

  return (
    <div>
      <div className="section-header">
        <span className="section-badge badge-admin">Manage</span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2744' }}>Legacy Workbook Sync</h2>
      </div>

      <div className="instructions">
        <h4>ℹ️ How this works</h4>
        <ol>
          <li>Import the existing legacy workbooks once. The app stores their sheet data in Firestore as the historical baseline.</li>
          <li>Keep using the normal weekly and monthly workflows. New saves are export-aware and can be merged back into the legacy spreadsheets.</li>
          <li>When another team needs the legacy file, export a merged workbook and replace the Google Sheet file manually.</li>
        </ol>
        <div style={{ marginTop: 12, fontSize: 13, color: '#92400e' }}>
          <strong>Import only trusted internal workbooks.</strong> The app reads the full spreadsheet in the browser and stores sheet contents in Firestore as the export baseline.
        </div>
      </div>

      <div className="kpi-grid kpi-grid-4" style={{ marginBottom: 20 }}>
        <div className="kpi-box">
          <div className="kpi-label">Monthly Snapshots</div>
          <div className="kpi-value">{snapshotCounts.monthlySnapshots}</div>
          <div className="text-muted">{snapshotCounts.exportablePlatform} platform saves include workbook rows</div>
        </div>
        <div className="kpi-box">
          <div className="kpi-label">ADK Share Saves</div>
          <div className="kpi-value">{snapshotCounts.adkVersionShare}</div>
          <div className="text-muted">weekly share snapshots</div>
        </div>
        <div className="kpi-box">
          <div className="kpi-label">Partner Saves</div>
          <div className="kpi-value">{snapshotCounts.partnerMigration}</div>
          <div className="text-muted">{snapshotCounts.exportablePartner} saves include raw Sentry rows</div>
        </div>
        <div className="kpi-box">
          <div className="kpi-label">Imported Workbooks</div>
          <div className="kpi-value">{Object.keys(imports).length}</div>
          <div className="text-muted">
            {loading
              ? 'Loading...'
              : `Program ${imports[LEGACY_WORKBOOK_TYPES.program] ? '✓' : '-'} / Burn Down ${imports[LEGACY_WORKBOOK_TYPES.burnDown] ? '✓' : '-'}`}
          </div>
        </div>
      </div>

      {status && <div className="alert alert-success">✅ {status}</div>}
      {error && <div className="alert alert-error">❌ {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {importCards.map((card) => (
          <div key={card.key} className="card" style={{ marginBottom: 0 }}>
            <div className="card-title">{card.title}</div>
            <div className="card-subtitle">{card.subtitle}</div>
            <UploadZone
              label={card.label}
              hint="Upload the exported `.xlsx` file from Google Sheets"
              accept=".xlsx"
              onFileSelected={importWorkbook(card.key)}
            />
            <div style={{ marginTop: 12, fontSize: 12, color: '#475569' }}>
              {card.filename ? (
                <>
                  <div><strong>Imported file:</strong> {card.filename}</div>
                  <div><strong>Imported at:</strong> {formatImportTimestamp(card.importedAtMs)}</div>
                  {card.rollbackEnabled && card.rollbackUntilMs ? (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <RollbackButton
                        subject={`${card.title.toLowerCase()} baseline`}
                        rollbackUntilMs={card.rollbackUntilMs}
                        onConfirm={rollbackWorkbookImport(card.key)}
                        disabled={busy === `rollback:${card.key}`}
                        label="Roll back import"
                      />
                      <span className="text-muted">
                        {canRollback(card.rollbackUntilMs) ? `Until ${formatImportTimestamp(card.rollbackUntilMs)}` : `${ROLLBACK_WINDOW_DAYS}-day window expired`}
                      </span>
                    </div>
                  ) : (
                    <div className="text-muted" style={{ marginTop: 10 }}>
                      Rollback is available for workbook imports created after this feature was added.
                    </div>
                  )}
                </>
              ) : (
                <div>No historical baseline imported yet.</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Export Merged Legacy Files</div>
        <div className="card-subtitle">Each export includes the imported baseline plus the exportable data that has been saved in the app since then.</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={() => exportWorkbook(LEGACY_WORKBOOK_TYPES.program)}
            disabled={busy === `export:${LEGACY_WORKBOOK_TYPES.program}`}
          >
            {busy === `export:${LEGACY_WORKBOOK_TYPES.program}` ? 'Exporting...' : '⬇️ Export Program Weekly KPIs'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => exportWorkbook(LEGACY_WORKBOOK_TYPES.burnDown)}
            disabled={busy === `export:${LEGACY_WORKBOOK_TYPES.burnDown}`}
          >
            {busy === `export:${LEGACY_WORKBOOK_TYPES.burnDown}` ? 'Exporting...' : '⬇️ Export ADK Burn Down'}
          </button>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
          <div><strong>Program workbook:</strong> merges imported workbook tabs with saved Platform &amp; Regional KPI snapshots plus ADK Version Share history. New combined monthly saves contribute regional data through the embedded estimation payload, while older standalone Regional KPI saves still remain exportable.</div>
          <div><strong>Burn down workbook:</strong> merges imported Discover tabs with saved Partner Migration uploads that include raw Sentry rows.</div>
          <div><strong>Important:</strong> platform rows are only exportable from saves created after this feature, because older snapshots did not retain the partner-level workbook data needed to rebuild the legacy tabs.</div>
        </div>
      </div>
    </div>
  );
}
