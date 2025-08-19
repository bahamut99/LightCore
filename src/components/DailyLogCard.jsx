// src/components/DailyCard.jsx
import React from 'react';

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function DailyCard({ card, onClose }) {
  if (!card) return null;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Daily summary">
      <div style={cardStyle}>
        <button aria-label="Close" onClick={onClose} style={closeBtn}>
          ×
        </button>

        <h3 style={titleStyle}>Today’s Summary — {fmtDate(card.date)}</h3>

        <div style={metricsRow}>
          <Metric name="Mental Clarity" value={card.clarity} />
          <Metric name="Immune Defense" value={card.immune} />
          <Metric name="Physical Readiness" value={card.physical} />
        </div>

        <div style={notesBox}>
          <div style={notesHeader}>LightCore AI Notes</div>
          <p style={notesText}>{card.ai_notes}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ name, value }) {
  return (
    <div style={metricCol}>
      <div style={metricLabel}>{name}</div>
      <div style={metricValue}>{value ?? '—'}</div>
    </div>
  );
}

/* Styles: match your current glass/neo look without changing layout */
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  backdropFilter: 'blur(2px)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const cardStyle = {
  width: '560px',
  maxWidth: '92vw',
  color: '#cfefff',
  background: 'rgba(10, 25, 47, 0.92)',
  border: '1px solid rgba(0,240,255,0.25)',
  boxShadow: '0 0 24px rgba(0,240,255,0.15)',
  borderRadius: '12px',
  padding: '1.25rem 1.25rem 1rem',
  fontFamily: "'Roboto Mono', monospace",
  position: 'relative',
};

const closeBtn = {
  position: 'absolute',
  top: 10,
  right: 10,
  width: 32,
  height: 32,
  color: '#00f0ff',
  background: 'transparent',
  border: '1px solid rgba(0,240,255,0.35)',
  borderRadius: 8,
  cursor: 'pointer',
};

const titleStyle = {
  fontFamily: "'Orbitron', sans-serif",
  fontSize: '1.05rem',
  margin: 0,
  marginBottom: '0.75rem',
  letterSpacing: '0.04em',
  textShadow: '0 0 5px #00f0ff',
};

const metricsRow = {
  display: 'flex',
  gap: '0.75rem',
  marginBottom: '0.75rem',
};

const metricCol = {
  flex: 1,
  background: 'rgba(0,240,255,0.06)',
  border: '1px solid rgba(0,240,255,0.18)',
  borderRadius: 8,
  padding: '0.5rem 0.75rem',
};

const metricLabel = {
  fontSize: 12,
  opacity: 0.85,
  marginBottom: 6,
};

const metricValue = {
  fontSize: 18,
  fontWeight: 700,
  color: '#e7fbff',
};

const notesBox = {
  background: 'rgba(0,240,255,0.06)',
  border: '1px solid rgba(0,240,255,0.18)',
  borderRadius: 8,
  padding: '0.65rem 0.75rem',
};

const notesHeader = {
  fontFamily: "'Orbitron', sans-serif",
  fontSize: 12,
  letterSpacing: '0.06em',
  color: '#9bd9ff',
  marginBottom: 6,
};

const notesText = {
  color: 'white',
  lineHeight: 1.6,
  margin: 0,
  whiteSpace: 'pre-wrap',
};
