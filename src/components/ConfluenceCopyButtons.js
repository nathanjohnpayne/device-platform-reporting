import React, { useRef, useState } from 'react';

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

export default function ConfluenceCopyButtons({ textContent, markdownContent }) {
  const [textCopied, setTextCopied] = useState(false);
  const [mdCopied, setMdCopied] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(null); // 'text' | 'markdown' | null
  const fallbackRef = useRef(null);

  const handleCopy = async (type) => {
    const content = type === 'text' ? textContent : markdownContent;
    try {
      await copyText(content);
      if (type === 'text') {
        setTextCopied(true);
        setTimeout(() => setTextCopied(false), 2000);
      } else {
        setMdCopied(true);
        setTimeout(() => setMdCopied(false), 2000);
      }
      setFallbackMode(null);
    } catch {
      setFallbackMode(type);
      setTimeout(() => {
        if (fallbackRef.current) {
          fallbackRef.current.select();
        }
      }, 50);
    }
  };

  const fallbackContent = fallbackMode === 'text' ? textContent : markdownContent;

  return (
    <div>
      <div className="output-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => handleCopy('text')}>
          {textCopied ? '✓ Copied!' : '📋 Copy Text'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => handleCopy('markdown')}>
          {mdCopied ? '✓ Copied!' : '⬇ Copy Markdown'}
        </button>
      </div>
      {fallbackMode && (
        <div style={{ marginTop: 10 }}>
          <div className="alert alert-info" style={{ marginBottom: 6 }}>
            Clipboard access unavailable. Select all text below and press Cmd/Ctrl+C to copy.
          </div>
          <textarea
            ref={fallbackRef}
            readOnly
            value={fallbackContent}
            style={{
              width: '100%',
              minHeight: 120,
              fontFamily: "'SF Mono', 'Courier New', monospace",
              fontSize: 12,
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: 12,
              resize: 'vertical',
            }}
            onClick={(e) => e.target.select()}
          />
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 6 }}
            onClick={() => setFallbackMode(null)}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
