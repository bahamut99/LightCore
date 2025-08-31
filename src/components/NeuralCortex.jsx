// src/components/NeuralCortex.jsx
// LightCore — Neural-Cortex view (fixed 7-slot ring + drag-to-rotate + snap)
// Center globe reduced ~20%; beams animate from core to each day.
// All other UI (buttons, drawers, HUD, nudges) unchanged.

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Float, QuadraticBezierLine } from '@react-three/drei';
import { EffectComposer, Bloom, FXAA } from '@react-three/postprocessing';
import * as THREE from 'three';
import { supabase } from '../supabaseClient';
import LogEntryModal from './LogEntryModal.jsx';

/* ---------------------- Config ---------------------- */

const EVENT_CONFIG = {
  Workout: { color: '#4ade80' },
  Meal: { color: '#facc15' },
  Caffeine: { color: '#f97316' },
  Default: { color: '#a78bfa' },
};

const hideScrollbarCSS = `
  * { scrollbar-width: none; -ms-overflow-style: none; }
  *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
`;

// Steps polling every 120s
const STEPS_POLL_MS = 120000;

/* ------------------------- Utils ------------------------- */

function normalizeGuidance(raw) {
  if (!raw) return null;
  const g =
    raw.guidance_for_user ||
    raw.guidance ||
    raw.lightcoreGuide ||
    raw.guide ||
    (raw.current_state ? raw : null);
  if (!g) return null;
  const clip = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
  return {
    current_state: g.current_state || g.currentState || g.summary || g.message || '',
    positives: clip(g.positives || g.strengths, 5),
    concerns: clip(g.concerns || g.risks || g.issues, 5),
    suggestions: clip(g.suggestions || g.actions || g.recommendations, 8),
  };
}

function useHoverCursor(isHovered) {
  useEffect(() => {
    const prev = document.body.style.cursor;
    document.body.style.cursor = isHovered ? 'pointer' : 'auto';
    return () => {
      document.body.style.cursor = prev;
    };
  }, [isHovered]);
}

async function fetchWithTimeout(promise, ms) {
  let t;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => (t = setTimeout(() => reject(new Error('timeout')), ms))),
    ]);
  } finally {
    clearTimeout(t);
  }
}

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// Last N calendar days (today included), newest last
function lastNDays(n) {
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(d);
  }
  return out;
}

// Local YYYY-MM-DD
function localKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

// Map 0..10 → brightness [0.2 .. 2.0]
function scoreToIntensity(s) {
  if (typeof s !== 'number') return 0.2;
  const clamped = Math.max(0, Math.min(10, s));
  return 0.2 + (clamped / 10) * 1.8;
}

/* ------------------------- Shared UI ------------------------- */

const neoBtnStyle = {
  fontFamily: "'Orbitron', sans-serif",
  fontSize: '0.8rem',
  letterSpacing: '0.04em',
  color: '#cfefff',
  height: '38px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 1rem',
  background: 'linear-gradient(180deg, rgba(10,25,47,0.85) 0%, rgba(10,25,47,0.7) 100%)',
  border: '1px solid rgba(0, 240, 255, 0.35)',
  borderRadius: '10px',
  cursor: 'pointer',
  backdropFilter: 'blur(6px)',
  textDecoration: 'none',
  transition: 'transform .12s ease, box-shadow .12s ease, border-color .12s ease',
};

function NeoButton({ as = 'button', href, children, onClick, title, style = {} }) {
  const [hover, setHover] = useState(false);
  const s = {
    ...neoBtnStyle,
    ...style,
    boxShadow: hover ? '0 0 12px rgba(0,240,255,0.35)' : '0 0 6px rgba(0,240,255,0.15)',
    borderColor: hover ? 'rgba(0,240,255,0.6)' : 'rgba(0,240,255,0.35)',
    transform: hover ? 'translateY(-1px)' : 'translateY(0)',
  };
  if (as === 'a') {
    return (
      <a
        href={href}
        title={title}
        style={s}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      title={title}
      style={s}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </button>
  );
}

/* ------------------------- Left Stack ------------------------- */

function LeftStack({ onSwitchView, onOpenSettings }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '2rem',
        left: '2rem',
        zIndex: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <NeoButton onClick={onSwitchView} title="Switch to Classic Dashboard">
        CLASSIC VIEW
      </NeoButton>
      <NeoButton onClick={onOpenSettings} title="Open Settings">
        SETTINGS
      </NeoButton>
    </div>
  );
}

/* ------------------------- Settings Drawer ------------------------- */

function SettingsDrawer({ open, onClose, onExport, onDelete, onSetUIPref, currentUIPref }) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
          pointerEvents: 'auto',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0, // ⬅ anchored left
          width: '420px',
          height: '100vh',
          background: 'rgba(10, 25, 47, 0.92)',
          borderRight: '1px solid rgba(0,240,255,0.25)',
          boxShadow: '0 0 24px rgba(0,240,255,0.15)',
          backdropFilter: 'blur(10px)',
          padding: '1rem 1rem 1.5rem',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
          <h2
            style={{
              fontFamily: "'Orbitron', sans-serif",
              color: '#cfefff',
              fontSize: '1.1rem',
              letterSpacing: '0.04em',
              margin: 0,
            }}
          >
            SETTINGS
          </h2>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close settings"
            style={{
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center', // ⬅ centers the glyph perfectly
              color: '#00f0ff',
              background: 'transparent',
              border: '1px solid rgba(0,240,255,0.35)',
              borderRadius: 8,
              cursor: 'pointer',
              lineHeight: 1,
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>

        <section style={{ marginBottom: '1rem' }}>
          <h3
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '0.9rem',
              color: '#9bd9ff',
              margin: '0 0 0.5rem',
            }}
          >
            UI PREFERENCE
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <NeoButton
              onClick={() => onSetUIPref('neural')}
              style={{
                flex: 1,
                borderColor: currentUIPref === 'neural' ? '#38e8ff' : 'rgba(0,240,255,0.35)',
                boxShadow:
                  currentUIPref === 'neural'
                    ? '0 0 12px rgba(0,240,255,0.35)'
                    : '0 0 6px rgba(0,240,255,0.15)',
              }}
            >
              NEURAL-CORTEX
            </NeoButton>
            <NeoButton
              onClick={() => onSetUIPref('classic')}
              style={{
                flex: 1,
                borderColor: currentUIPref === 'classic' ? '#38e8ff' : 'rgba(0,240,255,0.35)',
                boxShadow:
                  currentUIPref === 'classic'
                    ? '0 0 12px rgba(0,240,255,0.35)'
                    : '0 0 6px rgba(0,240,255,0.15)',
              }}
            >
              CLASSIC
            </NeoButton>
          </div>
          <p style={{ color: '#98a9c1', fontSize: 12, marginTop: 8 }}>
            Your choice loads automatically on next sign-in.
          </p>
        </section>

        <section style={{ marginBottom: '1rem' }}>
          <h3
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '0.9rem',
              color: '#9bd9ff',
              margin: '0 0 0.5rem',
            }}
          >
            PRIVACY
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <NeoButton onClick={onExport} style={{ flex: 1 }}>
              EXPORT MY DATA
            </NeoButton>
            <NeoButton onClick={onDelete} style={{ flex: 1 }}>
              DELETE ACCOUNT
            </NeoButton>
          </div>
          <p style={{ color: '#98a9c1', fontSize: 12, marginTop: 8 }}>
            Stored with RLS. No selling of data.
          </p>
        </section>
      </div>
    </div>
  );
}

/* ------------------------- Guide Panel ------------------------- */

function GuidePanel({ guide }) {
  const g =
    guide || {
      current_state: 'Generating your guidance…',
      positives: [],
      concerns: [],
      suggestions: ['Keep logging — your personalized guide is being prepared.'],
    };

  return (
    <div
      aria-label="LightCore Guide"
      style={{
        position: 'absolute',
        top: '2rem',
        right: '2rem',
        width: '440px',
        color: '#00f0ff',
        background: 'rgba(10, 25, 47, 0.72)',
        border: '1px solid rgba(0, 240, 255, 0.25)',
        boxShadow: '0 0 24px rgba(0,240,255,0.15)',
        backdropFilter: 'blur(10px)',
        borderRadius: '12px',
        padding: '1.25rem 1.25rem 1rem',
        fontFamily: "'Roboto Mono', monospace",
        fontSize: '14px',
        zIndex: 11,
      }}
    >
      <h2
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '1.1rem',
          textShadow: '0 0 5px #00f0ff',
          margin: 0,
          marginBottom: '0.75rem',
          letterSpacing: '0.04em',
        }}
      >
        LIGHTCØRE GUIDE
      </h2>

      <p
        style={{
          color: 'white',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
          fontStyle: 'italic',
          marginTop: 0,
          marginBottom: '0.75rem',
        }}
      >
        {g.current_state}
      </p>

      {(g.positives?.length || g.concerns?.length) > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '0.25rem',
            marginBottom: '0.75rem',
          }}
        >
          {(g.positives || []).map((p) => (
            <p key={`p-${p}`} style={{ color: '#00ff88', margin: 0 }}>
              + {p}
            </p>
          ))}
          {(g.concerns || []).map((c) => (
            <p key={`c-${c}`} style={{ color: '#ffd700', margin: 0 }}>
              - {c}
            </p>
          ))}
        </div>
      )}

      {g.suggestions?.length > 0 && (
        <>
          <div
            style={{
              borderTop: '1px solid rgba(0,240,255,0.18)',
              margin: '0.5rem 0 0.75rem',
            }}
          />
          <h3
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '0.9rem',
              margin: 0,
              marginBottom: '0.5rem',
              letterSpacing: '0.04em',
            }}
          >
            SUGGESTIONS
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {g.suggestions.map((s) => (
              <span
                key={`s-${s}`}
                style={{
                  background: 'rgba(0,240,255,0.12)',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '12px',
                  color: '#cfefff',
                  border: '1px solid rgba(0,240,255,0.25)',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------- HUD (logs/nudges) ------------------------- */

function Hud({ item, onClose }) {
  const logObj = item?.ai_notes ? item : item?.log;
  const isLog = !!logObj?.created_at || !!logObj?.ai_notes;
  const isNudge = !!item?.headline || !!item?.body_text;
  if (!isLog && !isNudge) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '2rem',
        left: '2rem',
        width: '480px',
        color: '#00f0ff',
        background: 'rgba(10, 25, 47, 0.72)',
        border: '1px solid rgba(0, 240, 255, 0.25)',
        boxShadow: '0 0 24px rgba(0,240,255,0.15)',
        backdropFilter: 'blur(10px)',
        borderRadius: '12px',
        padding: '1rem',
        fontFamily: "'Roboto Mono', monospace",
        fontSize: '14px',
        zIndex: 11,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <h2
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '1.1rem',
            textShadow: '0 0 5px #00f0ff',
            margin: 0,
            letterSpacing: '0.04em',
            color: '#cfefff',
          }}
        >
          {isLog
            ? `LOG ENTRY: ${fmtDate(logObj.created_at)}`
            : `ANOMALY: ${item.headline?.toUpperCase?.() ?? ''}`}
        </h2>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          title="Close"
          style={{
            width: 32,
            height: 32,
            color: '#00f0ff',
            background: 'transparent',
            border: '1px solid rgba(0,240,255,0.35)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      {isLog && (
        <p style={{ color: 'white', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {logObj.ai_notes}
        </p>
      )}
      {isNudge && (
        <p style={{ color: 'white', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {item.body_text}
        </p>
      )}
    </div>
  );
}

/* ---------------------- LightCore Shaders ---------------------- */

const coreVertex = `
  uniform float uTime;
  uniform float uPulse;
  uniform float uDisplace;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    float w = sin(uTime * 1.5 + position.y * 2.0) * 0.5 + 0.5;
    vec3 displaced = position + normal * (uDisplace * (0.6 + 0.4 * w) * uPulse);
    vec4 wPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = wPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const coreFragment = `
  uniform vec3 uCoreColor;
  uniform vec3 uRimColor;
  uniform float uPulse;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    float ndotv = max(dot(N, V), 0.0);
    float fres = pow(1.0 - ndotv, 3.0);

    vec3 base = uCoreColor * (0.6 + 0.5 * uPulse);
    vec3 color = base + uRimColor * fres * (1.0 + 1.2 * uPulse);
    gl_FragColor = vec4(color, 0.98);
  }
`;

const atmoVertex = `
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 wPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = wPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmoFragment = `
  uniform vec3 uColor;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  void main() {
    vec3 V = normalize(cameraPosition - vWorldPosition);
    float fres = pow(1.0 - max(dot(normalize(vNormal), V), 0.0), 2.5);
    float alpha = fres * 0.45;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/* -------------------- 3D Elements -------------------- */

function LightCore({ radius = 3, color = '#00e7ff', rim = '#96f7ff', onClick, energy = 1 }) {
  const group = useRef();
  const atmoRef = useRef();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uDisplace: { value: 0.28 },
      uCoreColor: { value: new THREE.Color(color) },
      uRimColor: { value: new THREE.Color(rim) },
    }),
    [color, rim]
  );

  const atmoUniforms = useMemo(() => ({ uColor: { value: new THREE.Color(rim) } }), [rim]);

  useEffect(() => {
    uniforms.uPulse.value = 0;
  }, []); // eslint-disable-line

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += 0.12 * delta * (0.8 + 0.4 * uniforms.uPulse.value);
    uniforms.uTime.value += delta;
    uniforms.uPulse.value += (1 - uniforms.uPulse.value) * 0.05;
    if (atmoRef.current) {
      const s = 1.055 + Math.sin(state.clock.elapsedTime * 0.9) * 0.005;
      atmoRef.current.scale.setScalar(s);
    }
    const base = 1 + Math.sin(state.clock.elapsedTime * 1.2) * 0.012 * energy;
    group.current.scale.setScalar(base);
  });

  const ring = useMemo(() => {
    const g = new THREE.TorusGeometry(radius * 1.05, 0.06, 12, 120);
    const m = new THREE.MeshBasicMaterial({
      color: rim,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }, [radius, rim]);

  return (
    <group ref={group} onClick={onClick}>
      <mesh>
        <sphereGeometry args={[radius, 96, 96]} />
        <shaderMaterial
          vertexShader={coreVertex}
          fragmentShader={coreFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>

      <mesh ref={atmoRef} scale={1.055}>
        <sphereGeometry args={[radius * 1.02, 64, 64]} />
        <shaderMaterial
          vertexShader={atmoVertex}
          fragmentShader={atmoFragment}
          uniforms={atmoUniforms}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>

      <primitive object={ring} />
    </group>
  );
}

function AnomalyGlyph({ nudge, position, onGlyphClick }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);
  useHoverCursor(hovered);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y += 0.01;
      ref.current.position.y = position[1] + Math.sin(state.clock.getElapsedTime()) * 0.2;
    }
  });
  return (
    <group
      ref={ref}
      position={position}
      onClick={() => onGlyphClick(nudge)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <mesh>
        <octahedronGeometry args={[0.5]} />
        <meshStandardMaterial
          color="#ff4d4d"
          emissive="#ff4d4d"
          emissiveIntensity={hovered ? 2 : 1}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      <Text color="white" fontSize={0.8} position={[0, 0, 0.6]}>
        !
      </Text>
    </group>
  );
}

function EventNode({ event, position }) {
  const cfg = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.Default;
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshStandardMaterial color={cfg.color} emissive={cfg.color} emissiveIntensity={1.5} />
    </mesh>
  );
}

function SynapticLinks({ selectedLog, events }) {
  if (!selectedLog || !selectedLog.position || !selectedLog.log || events.length === 0) return null;
  const links = useMemo(() => {
    const start = new THREE.Vector3(...selectedLog.position);
    return events.map((event, i) => {
      const angle = Math.PI / 2 + (i - (events.length - 1) / 2) * 0.5;
      const end = new THREE.Vector3(
        start.x + Math.cos(angle) * 3,
        start.y + Math.sin(angle) * 3,
        start.z
      );
      const mid = new THREE.Vector3((start.x + end.x) / 2, (start.y + end.y) / 2 + 0.8, start.z);
      return { event, start, mid, end, key: `${event.event_time}-${i}` };
    });
  }, [selectedLog, events]);
  return (
    <group>
      {links.map(({ event, start, mid, end, key }) => (
        <group key={key}>
          <EventNode event={event} position={end} />
          <QuadraticBezierLine
            start={start}
            end={end}
            mid={mid}
            color="#00f0ff"
            lineWidth={1}
            transparent
            opacity={0.55}
          />
        </group>
      ))}
    </group>
  );
}

/* ----- New: Week ring nodes (7 slots, draggable rotate + snap) ----- */

const DAY_SHELL_COLORS = [
  '#00e7ff', // neon cyan
  '#a78bfa', // violet
  '#4ade80', // mint
  '#f472b6', // pink
  '#facc15', // amber
  '#22d3ee', // sky
  '#fb923c', // orange
];

const DOT_COLORS = {
  clarity: '#00f0ff', // cyan
  immune: '#ffd700', // gold
  physical: '#00ff88', // green
};

function DayNode({
  node, // {key,date,color,scores:{clarity,immune,physical}, avg, log}
  position,
  onSelect,
  isSelected,
  isHovered,
  setHovered,
}) {
  const ref = useRef();
  useHoverCursor(isHovered);

  useFrame((state) => {
    if (!ref.current) return;
    const pulse =
      1 + Math.sin(state.clock.elapsedTime * 2.0) * 0.035 * (node.avg ? node.avg / 10 : 0.3);
    const target = (isSelected ? 1.6 : isHovered ? 1.25 : 1.0) * pulse;
    const s = THREE.MathUtils.lerp(ref.current.scale.x, target, 0.15);
    ref.current.scale.setScalar(s);
  });

  const brightness = (name) => scoreToIntensity(node.scores?.[name]);

  return (
    <group
      position={position}
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ ...node, position });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(node);
      }}
      onPointerOut={() => setHovered(null)}
    >
      {/* Shell */}
      <mesh>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshStandardMaterial
          color={node.color}
          metalness={0.9}
          roughness={0.25}
          emissive={node.color}
          emissiveIntensity={node.avg != null ? 0.5 + node.avg / 20 : 0.15}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Tri-dots inside the node */}
      <mesh position={[-0.08, 0.05, 0.06]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshStandardMaterial
          color={DOT_COLORS.clarity}
          emissive={DOT_COLORS.clarity}
          emissiveIntensity={brightness('clarity')}
          metalness={0.6}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0.08, 0.05, 0.06]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshStandardMaterial
          color={DOT_COLORS.immune}
          emissive={DOT_COLORS.immune}
          emissiveIntensity={brightness('immune')}
          metalness={0.6}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, -0.07, 0.06]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshStandardMaterial
          color={DOT_COLORS.physical}
          emissive={DOT_COLORS.physical}
          emissiveIntensity={brightness('physical')}
          metalness={0.6}
          roughness={0.25}
        />
      </mesh>
    </group>
  );
}

// Glowing orb that travels along a quadratic curve (beam)
function BeamTraveler({ start, mid, end, offset = 0 }) {
  const dot = useRef();
  const s = useMemo(() => new THREE.Vector3(...start), [start]);
  const m = useMemo(() => new THREE.Vector3(...mid), [mid]);
  const e = useMemo(() => new THREE.Vector3(...end), [end]);

  const tmp = new THREE.Vector3();
  useFrame(({ clock }) => {
    if (!dot.current) return;
    const t = (Math.sin(clock.getElapsedTime() * 1.2 + offset) + 1) * 0.5;
    const it = 1 - t;
    tmp
      .copy(s)
      .multiplyScalar(it * it)
      .add(m.clone().multiplyScalar(2 * it * t))
      .add(e.clone().multiplyScalar(t * t));
    dot.current.position.copy(tmp);
  });

  return (
    <mesh ref={dot}>
      <sphereGeometry args={[0.07, 16, 16]} />
      <meshStandardMaterial
        color="#9cf3ff"
        emissive="#9cf3ff"
        emissiveIntensity={1.8}
        metalness={0.6}
        roughness={0.2}
      />
    </mesh>
  );
}

// Beams from the core to each node (follow ring rotation)
function LightBeams({ nodes, energy = 1 }) {
  const beams = useMemo(() => {
    return nodes.map((n, i) => {
      const start = [0, 0, 0];
      const end = n.position;
      const mid = [
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2 + 0.7,
        0,
      ];
      return { start, mid, end, key: `${n.key}-${i}` };
    });
  }, [nodes]);

  return (
    <group>
      {beams.map((b, i) => (
        <group key={b.key}>
          <QuadraticBezierLine
            start={b.start}
            end={b.end}
            mid={b.mid}
            color="#00f0ff"
            lineWidth={0.6}
            transparent
            opacity={0.35 + 0.25 * energy}
          />
          <BeamTraveler start={b.start} mid={b.mid} end={b.end} offset={i * 0.7} />
        </group>
      ))}
    </group>
  );
}

/* New: WeekRing with 7 fixed slots and drag-to-rotate snapping (no pointer-capture) */
function WeekRing({ weekNodes, onSelect, hovered, setHovered, selected, onDragStateChange }) {
  const radius = 6;
  const SLOTS = 7;
  const slotAngle = (Math.PI * 2) / SLOTS;

  // start so a node sits at 12 o'clock
  const [ringAngle, setRingAngle] = useState(-Math.PI / 2);
  const drag = useRef({ active: false, startX: 0, startAngle: 0 });

  // fixed slot angles + ring offset => positions
  const items = useMemo(() => {
    const baseAngles = Array.from({ length: SLOTS }, (_, i) => i * slotAngle);
    return weekNodes.map((n, i) => {
      const angle = baseAngles[i] + ringAngle - Math.PI / 2;
      const pos = [radius * Math.cos(angle), radius * Math.sin(angle), 0];
      return { ...n, position: pos };
    });
  }, [weekNodes, ringAngle]);

  // drag handlers (no setPointerCapture)
  const startDrag = (e) => {
    e.stopPropagation();
    drag.current.active = true;
    drag.current.startX = e.clientX ?? 0;
    drag.current.startAngle = ringAngle;
    onDragStateChange?.(true);
  };

  const moveDrag = (e) => {
    if (!drag.current.active) return;
    e.stopPropagation();
    const dx = (e.clientX ?? 0) - drag.current.startX;
    const factor = 0.0032; // px -> radians
    setRingAngle(drag.current.startAngle + dx * factor);
  };

  const endDrag = (e) => {
    if (!drag.current.active) return;
    e.stopPropagation();
    drag.current.active = false;
    // snap to nearest slot
    setRingAngle((a) => Math.round(a / slotAngle) * slotAngle);
    onDragStateChange?.(false);
  };

  return (
    <group
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerOut={endDrag}
    >
      {items.map((n) => (
        <DayNode
          key={n.key}
          node={n}
          position={n.position}
          onSelect={onSelect}
          isSelected={selected?.dayKey === n.key}
          isHovered={hovered?.dayKey === n.key}
          setHovered={setHovered}
        />
      ))}

      {/* Light beams follow the nodes */}
      <LightBeams nodes={items} energy={1} />

      {/* invisible torus makes dragging easy */}
      <mesh position={[0, 0, -0.01]}>
        <torusGeometry args={[radius, 0.25, 8, 64]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

// (Kept for quick rollback; not rendered now)
function LogNode({ log, position, setSelectedItem, isSelected, setHoveredLog, isHovered }) {
  const ref = useRef();
  useHoverCursor(isHovered);
  const dynamic = useMemo(() => {
    const avg =
      ((log.clarity_score || 0) +
        (log.immune_score || 0) +
        (log.physical_readiness_score || 0)) /
      30;
    return new THREE.Color().lerpColors(new THREE.Color(0xff4d4d), new THREE.Color(0x00f0ff), avg);
  }, [log]);
  useFrame(() => {
    if (!ref.current) return;
    const target = isSelected ? 1.8 : isHovered ? 1.3 : 1;
    const s = THREE.MathUtils.lerp(ref.current.scale.x, target, 0.1);
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh
      ref={ref}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedItem({ log, position });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoveredLog(log);
      }}
      onPointerOut={() => setHoveredLog(null)}
    >
      <sphereGeometry args={[0.2, 32, 32]} />
      <meshStandardMaterial
        color={dynamic}
        metalness={0.95}
        roughness={0.1}
        emissive={dynamic}
        emissiveIntensity={isSelected || isHovered ? 0.5 : 0}
      />
    </mesh>
  );
}

function Constellation({ logs, setSelectedItem, selectedItem, setHoveredLog, hoveredLog }) {
  return useMemo(() => {
    const radius = 6;
    return logs.map((log, i) => {
      const angle = (i / logs.length) * Math.PI * 2;
      const pos = [radius * Math.cos(angle), radius * Math.sin(angle), 0];
      return (
        <LogNode
          key={log.id || log.created_at || i}
          log={log}
          position={pos}
          setSelectedItem={setSelectedItem}
          isSelected={selectedItem?.log?.created_at === log.created_at}
          setHoveredLog={setHoveredLog}
          isHovered={hoveredLog?.created_at === log.created_at}
        />
      );
    });
  }, [logs, setSelectedItem, selectedItem, setHoveredLog, hoveredLog]);
}

/* ------------------------ Main ------------------------ */

function NeuralCortex({ onSwitchView }) {
  const [logHistory, setLogHistory] = useState([]);
  const [latestScores, setLatestScores] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [hoveredLog, setHoveredLog] = useState(null);
  const [dayEvents, setDayEvents] = useState([]);
  const [activeNudges, setActiveNudges] = useState([]);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [stepCount, setStepCount] = useState(null);
  const [guideData, setGuideData] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uiPref, setUiPref] = useState('neural');
  const [ringDragging, setRingDragging] = useState(false); // NEW

  const lastGuideRequestRef = useRef(0);
  const idleRef = useRef(null);

  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.margin = '';
      document.body.style.padding = '';
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = hideScrollbarCSS;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const getAuthHeader = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const requestGuidance = async () => {
    try {
      const now = Date.now();
      if (now - lastGuideRequestRef.current < 15000) return null;
      lastGuideRequestRef.current = now;

      const headers = await getAuthHeader();
      const json = await fetchWithTimeout(
        fetch('/.netlify/functions/generate-guidance', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'neural-cortex' }),
        }).then((r) => (r.ok ? r.json() : null)),
        10000
      );
      const g = normalizeGuidance(json);
      if (g) setGuideData(g);
      return g;
    } catch {
      return null;
    }
  };

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setIsLoading(false);
        return;
      }

      if (!guideData) requestGuidance().catch(() => {});

      const [logRes, nudgeRes] = await Promise.all([
        supabase
          .from('daily_logs')
          .select(
            'id, created_at, clarity_score, immune_score, physical_readiness_score, tags, ai_notes'
          )
          .order('created_at', { ascending: false })
          .limit(30),
        supabase.from('nudges').select('*').eq('is_acknowledged', false),
      ]);

      const { data: logs } = logRes;
      if (logs && logs.length > 0) {
        setLogHistory(logs);
        setLatestScores({ ...logs[0] });
      } else {
        setLatestScores({
          clarity_score: 8,
          immune_score: 8,
          physical_readiness_score: 8,
        });
      }

      const { data: nudges } = nudgeRes;
      setActiveNudges(nudges || []);
      setIsLoading(false);

      // One-off steps fetch (local timezone)
      fetchWithTimeout(
        (async () => {
          const headers = await getAuthHeader();
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          return fetch(`/.netlify/functions/fetch-health-data?tz=${encodeURIComponent(tz)}`, {
            headers,
          }).then((r) => (r.ok ? r.json() : null));
        })(),
        6000
      )
        .then((stepRes) => {
          if (typeof stepRes?.steps === 'number') setStepCount(stepRes.steps);
        })
        .catch(() => {});
    } catch {
      setIsLoading(false);
    }
  };

  // Realtime + initial fetch
  useEffect(() => {
    fetchAllData();

    const channel = supabase
      .channel('realtime:daily_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'daily_logs' },
        (payload) => {
          setLogHistory((prev) => [payload.new, ...prev].slice(0, 30));
          setLatestScores({ ...payload.new });
          requestGuidance().catch(() => {});
        }
      )
      .subscribe();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      fetchAllData();
    });

    return () => {
      supabase.removeChannel(channel);
      authListener?.subscription?.unsubscribe?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Steps polling every 120s (local timezone)
  useEffect(() => {
    let timer;
    let cancelled = false;

    const tick = async () => {
      try {
        const headers = await getAuthHeader();
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await fetch(
          `/.netlify/functions/fetch-health-data?tz=${encodeURIComponent(tz)}`,
          { headers }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data?.steps === 'number') {
          setStepCount(data.steps);
        }
      } catch {
        // ignore transient network errors
      }
    };

    tick();
    timer = setInterval(tick, STEPS_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Load day events when a (day) log is selected
  useEffect(() => {
    if (selectedItem && selectedItem.log) {
      (async () => {
        const { data, error } = await supabase
          .from('events')
          .select('event_type, event_time')
          .eq('log_id', selectedItem.log.id);
        if (!error) setDayEvents(data || []);
      })();
    } else {
      setDayEvents([]);
    }
  }, [selectedItem]);

  const lightIntensities = useMemo(() => {
    if (!latestScores)
      return { clarity: 0, immune: 0, physical: 0, energy: 1 };
    const clamp10 = (v) => Math.min(10, v || 0);
    const c = clamp10(latestScores.clarity_score);
    const i = clamp10(latestScores.immune_score);
    const p = clamp10(latestScores.physical_readiness_score);
    const energy = (c + i + p) / 30;
    return {
      clarity: c * 30,
      immune: i * 30,
      physical: p * 30,
      energy: 0.75 + energy * 0.5,
    };
  }, [latestScores]);

  const handleCloseHud = async () => {
    const item = selectedItem;
    setSelectedItem(null);
    if (item?.id && (item?.headline || item?.body_text)) {
      try {
        await supabase
          .from('nudges')
          .update({
            is_acknowledged: true,
            acknowledged_at: new Date().toISOString(),
          })
          .eq('id', item.id);
        setActiveNudges((prev) => prev.filter((n) => n.id !== item.id));
      } catch {}
    }
  };

  const handleLocusClick = async () => {
    await requestGuidance();
  };

  const handleOpenSettings = () => setDrawerOpen(true);
  const handleCloseSettings = () => setDrawerOpen(false);

  const onExport = async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/.netlify/functions/export-user-data', { headers });
      if (!res.ok) return alert('Export failed.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lightcore-export.json';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Export failed.');
    }
  };

  const onDelete = async () => {
    if (!confirm('Delete your account and all data? This cannot be undone.')) return;
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/.netlify/functions/delete-my-data', { headers });
      if (res.ok) {
        alert('Deleted. You will be signed out.');
        await supabase.auth.signOut();
        window.location.href = '/';
      } else alert('Delete failed.');
    } catch {
      alert('Delete failed.');
    }
  };

  const onSetUIPref = async (view) => {
    setUiPref(view);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ preferred_view: view }).eq('id', user.id);
      }
    } catch {}
  };

  /* ---------- Build the 7-day ring from logHistory ---------- */
  const weekNodes = useMemo(() => {
    const byDay = new Map();
    for (const log of logHistory) {
      const k = localKey(log.created_at);
      const existing = byDay.get(k);
      if (!existing || new Date(log.created_at) > new Date(existing.created_at)) {
        byDay.set(k, log);
      }
    }

    const days = lastNDays(7);
    return days.map((d, idx) => {
      const key = localKey(d);
      const log = byDay.get(key) || null;
      const clarity = log?.clarity_score ?? null;
      const immune = log?.immune_score ?? null;
      const physical = log?.physical_readiness_score ?? null;
      const avg =
        log != null ? (Number(clarity || 0) + Number(immune || 0) + Number(physical || 0)) / 3 : null;
      return {
        key,
        date: d,
        color: DAY_SHELL_COLORS[idx % DAY_SHELL_COLORS.length],
        scores: { clarity, immune, physical },
        avg,
        log, // may be null
      };
    });
  }, [logHistory]);

  // Selecting a day uses its latest log (if any)
  const selectDay = (node) => {
    setSelectedItem({
      dayKey: node.key,
      log: node.log || null,
      position: node.position || [0, 0, 0],
    });
  };

  const setHoveredDay = (nodeOrNull) => {
    setHoveredLog(nodeOrNull ? { dayKey: nodeOrNull.key } : null);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      <LeftStack onSwitchView={onSwitchView} onOpenSettings={handleOpenSettings} />
      <GuidePanel guide={guideData} />
      <Hud item={selectedItem} onClose={handleCloseHud} />

      <SettingsDrawer
        open={drawerOpen}
        onClose={handleCloseSettings}
        onExport={onExport}
        onDelete={onDelete}
        onSetUIPref={onSetUIPref}
        currentUIPref={uiPref}
      />

      <LogEntryModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onLogSubmitted={() => setIsLogModalOpen(false)}
        stepCount={stepCount}
      />

      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 12], fov: 75 }}
      >
        <color attach="background" args={['#0a0a1a']} />
        <ambientLight intensity={0.2} />
        <pointLight position={[-10, 5, 5]} intensity={lightIntensities.clarity} color="#00f0ff" />
        <pointLight position={[10, 5, 5]} intensity={lightIntensities.immune} color="#ffd700" />
        <pointLight position={[0, -10, 5]} intensity={lightIntensities.physical} color="#00ff88" />

        {!isLoading && (
          <>
            {/* ~20% smaller center globe */}
            <LightCore
              radius={2.4}
              color="#00e7ff"
              rim="#9cf3ff"
              energy={lightIntensities.energy}
              onClick={handleLocusClick}
            />

            {/* New fixed 7-slot ring with drag rotate + snap */}
            <WeekRing
              weekNodes={weekNodes}
              onSelect={selectDay}
              hovered={hoveredLog}
              setHovered={setHoveredDay}
              selected={selectedItem}
              onDragStateChange={setRingDragging}
            />

            {/* Events for selected day */}
            <SynapticLinks selectedLog={selectedItem} events={dayEvents} />

            {activeNudges.map((nudge, idx) => (
              <AnomalyGlyph
                key={nudge.id}
                nudge={nudge}
                position={[-8, 4 - idx * 2, -5]}
                onGlyphClick={setSelectedItem}
              />
            ))}
            <LogEntryButton onClick={() => setIsLogModalOpen(true)} />
          </>
        )}

        <OrbitControls
          enabled={!ringDragging}
          enablePan={false}
          enableZoom={true}
          autoRotate={true}
          autoRotateSpeed={0.3}
          onStart={() => {
            clearTimeout(idleRef.current);
          }}
          onEnd={() => {
            clearTimeout(idleRef.current);
            idleRef.current = setTimeout(() => {}, 4000);
          }}
        />

        <EffectComposer multisampling={0}>
          <FXAA />
          <Bloom intensity={1.0} luminanceThreshold={0.45} luminanceSmoothing={0.8} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

export default NeuralCortex;

