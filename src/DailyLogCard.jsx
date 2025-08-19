// src/components/DailyLogCard.jsx
import React from 'react';

const wrap = {
  position: 'fixed',
  right: '2rem',
  top: '6rem',
  width: '420px',
  maxWidth: '95vw',
  background: 'rgba(17, 24, 39, 0.92)',
  color: '#dbeafe',
  border: '1px solid rgba(56,189,248,0.25)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  borderRadius: '12px',
  padding: '1rem 1rem 0.85rem',
  zIndex: 1000,
  backdropFilter: 'blur(6px)',
  fontFamily:
    "'Inter', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
};

const head = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginBottom: '0.5rem',
};

const title = {
  margin: 0,
  fontSize: '1.05rem',
  fontWeight: 700,
  letterSpacing: '0.02em',
  color: '#cfefff',
};

const xBtn = {
  marginLeft: 'auto',
  width: 30,
  height: 30,
  borderRadius: 8,
  border: '1px solid rgba(56,189,248,0.35)',
  color: '#7dd3fc',
  background: 'transparent',
  cursor: 'pointer',
};

const row = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'center',
  gap: '0.5rem',
  marginTop: '0.2rem',
  color: '#9fbad7',
  fontSize: 13,
};

const chip = (bg) => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 12,
  color: '#0b1322',
  background: bg,
  fontWeight: 700,
});

const rule = {
  borderTop: '1px solid rgba(56,189,248,0.18)',
  margin: '0.65rem 0 0.6rem',
};

export default function DailyLogCard({ entry, onClose }) {
  if (!entry) return null;

  const dt = entry.created_at ? new Date(entry.created_at) : new Date();
  const date = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const clarity = entry.clarity_score ?? entry.clarity ?? 0;
  const immune = entry.immune_score ?? entry.immune ?? 0;
  const physical = entry.physical_readiness_score ?? entry.physical ?? 0;

  return (
    <div style={wrap} role="dialog" aria-label="Daily log summary">
      <div style={head}>
        <h3 style={title}>Daily Log • {date}</h3>
        <button type="button" onClick={onClose} style={xBtn} aria-label="Close">
          ×
        </button>
      </div>

      <div style={row}>
        <span>Mental Clarity</span>
        <span style={chip('#7dd3fc')}>{clarity}</span>
      </div>
      <div style={row}>
        <span>Immune</span>
        <span style={chip('#fde68a')}>{immune}</span>
      </div>
      <div style={row}>
        <span>Physical Readiness</span>
        <span style={chip('#86efac')}>{physical}</span>
      </div>

      <div style={rule} />

      <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {entry.ai_notes || 'No AI notes generated.'}
      </p>

      {Array.isArray(entry.tags) && entry.tags.length > 0 && (
        <>
          <div style={rule} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {entry.tags.map((t) => (
              <span key={t} style={chip('rgba(56,189,248,0.18)')}>
                {t}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
