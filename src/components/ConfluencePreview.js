import React from 'react';

const CHART_PLACEHOLDER_RE = /<!--\s*\[CHART:\s*([^\]]*)\][\s\S]*?-->/g;

function parseSegments(content) {
  const segments = [];
  let lastIndex = 0;
  const re = new RegExp(CHART_PLACEHOLDER_RE.source, 'g');
  let match;

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'chart', title: match[1].trim() });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return segments;
}

export default function ConfluencePreview({ content }) {
  if (!content) {
    return (
      <div className="output-preview" style={{ color: '#64748b', fontStyle: 'italic' }}>
        No output yet.
      </div>
    );
  }

  const segments = parseSegments(content);

  return (
    <div className="output-preview" style={{ maxHeight: 'none', padding: 0 }}>
      {segments.map((segment, index) => {
        if (segment.type === 'chart') {
          return (
            <div
              key={index}
              style={{
                background: '#334155',
                border: '2px dashed #64748b',
                borderRadius: 6,
                padding: '10px 14px',
                margin: '8px 16px',
                fontSize: 12,
              }}
            >
              <strong style={{ color: '#e2e8f0' }}>📊 Chart: {segment.title}</strong>
              <div style={{ color: '#94a3b8', marginTop: 4, fontSize: 11 }}>
                Paste chart image here — use Copy Chart button above, then Insert &gt; Image in Confluence.
              </div>
            </div>
          );
        }

        return (
          <pre
            key={index}
            style={{
              margin: 0,
              padding: '16px 20px',
              fontFamily: "'SF Mono', 'Courier New', monospace",
              fontSize: 12,
              color: '#94a3b8',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {segment.content}
          </pre>
        );
      })}
    </div>
  );
}
