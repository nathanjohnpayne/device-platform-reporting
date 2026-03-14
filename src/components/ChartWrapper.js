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
    <div className="chart-wrapper">
      <div className="chart-wrapper__viewport">
        <div ref={containerRef} className="chart-wrapper__canvas">
          {chart}
        </div>
      </div>
      <button
        onClick={handleCopy}
        disabled={busy}
        title={copied ? 'Copied!' : `Copy chart: ${title}`}
        className={`chart-copy-button${copied ? ' is-copied' : ''}`}
      >
        {busy ? 'Copying...' : copied ? 'Copied' : 'Copy chart'}
      </button>
    </div>
  );
}
