// components/UploadZone.js
import React, { useRef, useState } from 'react';
import Papa from 'papaparse';

export default function UploadZone({ label, hint, expectedColumns, onParsed, accept = '.csv' }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState(null); // null | 'ok' | 'error'
  const [message, setMessage] = useState('');
  const [filename, setFilename] = useState('');

  const process = (file) => {
    if (!file) return;
    setFilename(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        // Validate expected columns if provided
        if (expectedColumns) {
          const missing = expectedColumns.filter(c => !meta.fields.includes(c));
          if (missing.length) {
            setStatus('error');
            setMessage(`Missing columns: ${missing.join(', ')}`);
            return;
          }
        }
        setStatus('ok');
        setMessage(`${data.length.toLocaleString()} rows loaded`);
        onParsed(data, meta.fields);
      },
      error: (err) => {
        setStatus('error');
        setMessage(err.message);
      }
    });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    process(e.dataTransfer.files[0]);
  };

  return (
    <div>
      <div
        className={`upload-zone${drag ? ' drag-over' : ''}`}
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={e => process(e.target.files[0])}
        />
        <div className="upload-zone-icon">
          {status === 'ok' ? '✅' : status === 'error' ? '❌' : '📂'}
        </div>
        <h3>{status === 'ok' ? filename : label}</h3>
        <p>
          {status === 'ok' ? message :
           status === 'error' ? <span style={{color:'#dc2626'}}>{message}</span> :
           hint || 'Click or drag to upload a CSV file'}
        </p>
        {status && (
          <p style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>Click to replace</p>
        )}
      </div>
      {expectedColumns && (
        <p className="text-muted" style={{ marginTop: 8 }}>
          Expected columns: {expectedColumns.map(c => <span key={c} className="tag" style={{ marginRight: 4 }}>{c}</span>)}
        </p>
      )}
    </div>
  );
}
