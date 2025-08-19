// src/components/DailyCard.jsx
import React from 'react';

function fmtDate(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return '';
  }
}

/**
 * Props:
 *  - isOpen: boolean
 *  - card: {
 *      created_at?: string,
 *      clarity_score?: number,
 *      immune_score?: number,
 *      physical_readiness_score?: number,
 *      ai_notes?: string
 *    }
 *  - onClose: () => void
 */
export default function DailyCard({ isOpen, card, onClose }) {
  if (!isOpen || !card) return null;

  const clarity = card.clarity_score ?? '-';
  const immune  = card.immune_score ?? '-';
  const physical = card.physical_readiness_score ?? '-';
  const notes = card.ai_notes || 'No specific notes generated.';

  return (
    <div
      aria-label="Daily Card Overlay"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 40,
        width: 360,
        background: 'rgba(10, 25, 47, 0.92)',
        border: '1px solid rgba(0, 240, 255, 0.25)',
        borderRadius: 12,
        boxShadow: '0 0 24px rgba(0,240,255,0.15)',
        color: '#cfefff',
        fontFamily: "'Roboto Mono', monospace",
        padding: '14px 14px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3
          style={{
            margin: 0,
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 16,
            letterSpacing: '0.04em',
            color: '#e7fbff',
            textShadow: '0 0 5px #00f0ff',
          }}
        >
          Today’s Scores
        </h3>
        <div style={{ flex: 1 }} />
        <button
          aria-label="Close daily card"
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            background: 'transparent',
            color: '#00f0ff',
            border: '1px solid rgba(0,240,255,0.35)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>

      <p style={{ margin: '6px 0 10px', color: '#9bb8cc', fontSize: 12 }}>
        {fmtDate(card.created_at)}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <Metric label="Clarity" value={clarity} color="#00f0ff" />
        <Metric label="Immune" value={immune} color="#ffd700" />
        <Metric label="Physical" value={physical} color="#00ff88" />
      </div>

      <div
        style={{
          borderTop: '1px solid rgba(0,240,255,0.18)',
          paddingTop: 8,
        }}
      >
        <p style={{ margin: 0, color: '#ffffff', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {notes}
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div
      style={{
        background: 'rgba(0,240,255,0.06)',
        border: '1px solid rgba(0,240,255,0.25)',
        borderRadius: 8,
        padding: '8px 10px',
      }}
    >
      <div style={{ fontSize: 11, color: '#9bb8cc' }}>{label}</div>
      <div
        style={{
          marginTop: 4,
          fontSize: 18,
          fontWeight: 700,
          color,
          textShadow: `0 0 6px ${color}55`,
        }}
      >
        {value}
      </div>
    </div>
  );
}
