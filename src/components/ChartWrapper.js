import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { slugify } from '../utils/reporting';

export default function ChartWrapper({ title, height = 280, children }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef(null);

  const handleCopy = async () => {
    if (busy || !containerRef.current) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: null,
        scale: 1,
        logging: false,
      });

      let success = false;
      try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        success = true;
      } catch {
        // Clipboard API unavailable — fall back to download
      }

      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Trigger download fallback
        const today = new Date().toISOString().slice(0, 10);
        const filename = `${slugify(title)}-${today}.png`;
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.download = filename;
        a.href = dataUrl;
        a.click();
      }
    } catch (err) {
      console.error('ChartWrapper copy failed:', err);
    } finally {
      setBusy(false);
    }
  };

  // Clone the single child and inject fixed width/height props
  const child = React.Children.only(children);
  const chart = React.cloneElement(child, { width: 800, height });

  return (
    <div style={{ position: 'relative', width: 800, overflowX: 'auto', marginBottom: 8 }}>
      <div ref={containerRef}>
        {chart}
      </div>
      <button
        onClick={handleCopy}
        disabled={busy}
        title={copied ? 'Copied!' : `Copy chart: ${title}`}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: 'rgba(15, 39, 68, 0.7)',
          border: '1px solid #334155',
          borderRadius: 4,
          color: copied ? '#4ade80' : '#94a3b8',
          cursor: busy ? 'default' : 'pointer',
          fontSize: 12,
          padding: '3px 7px',
          lineHeight: 1.4,
        }}
      >
        {copied ? '✓' : '⎘'}
      </button>
    </div>
  );
}
