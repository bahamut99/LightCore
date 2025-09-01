// src/components/NeuralCortex.jsx
// LightCore — Neural-Cortex view (enhanced center globe + 7-day ring)
// - Center globe sits in the water plane, slightly smaller
// - Exactly 7 day-nodes around the core (last 7 calendar days)
// - Each day has its own neon shell color + three inner dots (clarity/immune/physical brightness)
// - Animated beams from the LightCore to each day-node (level with the water)
// - Ripples under the core and each node
// - Non-breaking overlays (buttons, drawers, guide, HUD, nudges)

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Float, QuadraticBezierLine } from '@react-three/drei';
import { EffectComposer, Bloom, FXAA, DepthOfField } from '@react-three/postprocessing';
import * as THREE from 'three';
import { supabase } from '../supabaseClient';
import LogEntryModal from './LogEntryModal.jsx';

/* ---------------------- Config ---------------------- */

const EVENT_CONFIG = {
  Workout:  { color: '#64FFD8' }, // mint-cyan
  Meal:     { color: '#A0E7FF' }, // ice blue
  Caffeine: { color: '#7FEAFF' }, // aqua
  Default:  { color: '#B29CFF' }, // lilac
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

// Local YYYY-MM-DD (avoid TZ surprises)
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
          left: 0,
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
              justifyContent: 'center',
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

/* ---------------------- HUD (selected day / nudge) ---------------------- */

function Hud({ item, onClose }) {
  if (!item) return null;

  // Accept either a daily log object or a nudge object
  const isNudge = item && (item.headline || item.body_text);
  const log =
    !isNudge && (item.created_at || item.clarity_score || item.ai_notes) ? item : null;

  const title = isNudge ? (item.headline || 'Notice') : 'Daily Log';
  const subtitle = isNudge
    ? (item.category || 'Nudge')
    : (log?.created_at ? fmtDate(log.created_at) : (item.date ? fmtDate(item.date) : (item.dayKey || '')));

  const notes = isNudge ? item.body_text : (log?.ai_notes || '');

  const scores = isNudge
    ? null
    : {
        clarity: log?.clarity_score ?? log?.scores?.clarity ?? null,
        immune: log?.immune_score ?? log?.scores?.immune ?? null,
        physical: log?.physical_readiness_score ?? log?.scores?.physical ?? null,
      };

  return (
    <div
      style={{
        position: 'absolute',
        left: '2rem',
        bottom: '2rem',
        width: 420,
        zIndex: 13,
        background: 'rgba(10, 25, 47, 0.78)',
        border: '1px solid rgba(0,240,255,0.25)',
        boxShadow: '0 0 24px rgba(0,240,255,0.18)',
        borderRadius: 12,
        backdropFilter: 'blur(10px)',
        color: '#cfefff',
        padding: '1rem 1rem 0.75rem',
        fontFamily: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ margin: 0, fontFamily: "'Orbitron', sans-serif", letterSpacing: '.04em' }}>
          {title}
        </h3>
        <span style={{ opacity: 0.8, fontSize: 12 }}>{subtitle}</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          title="Close"
          style={{
            background: 'transparent',
            color: '#00f0ff',
            border: '1px solid rgba(0,240,255,0.35)',
            borderRadius: 8,
            width: 28,
            height: 28,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {scores && (
        <div style={{ display: 'flex', gap: 10, marginTop: 8, marginBottom: 6 }}>
          <Badge label="Clarity" value={scores.clarity} hue="#00f0ff" />
          <Badge label="Immune" value={scores.immune} hue="#ffd700" />
          <Badge label="Physical" value={scores.physical} hue="#00ff88" />
        </div>
      )}

      {notes && (
        <p style={{ margin: '6px 0 10px', whiteSpace: 'pre-wrap', color: 'white' }}>{notes}</p>
      )}
    </div>
  );
}

function Badge({ label, value, hue }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${hue}55`,
        background: `${hue}22`,
        color: '#eaffff',
        fontSize: 12,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: hue,
          boxShadow: `0 0 10px ${hue}`,
        }}
      />
      {label}: {value ?? '—'}
    </span>
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

/* ----- High-Quality Water Surface Shader ----- */
const waterVertex = `
  uniform float uTime;
  varying vec2 vUv;

  vec3 permute(vec3 x){ return mod(((x*34.0)+1.0)*x,289.0); }
  float snoise(vec2 v){
    const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
    vec2 i=floor(v+dot(v,C.yy));
    vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
    vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
    i=mod(i,289.0);
    vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
    vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
    m=m*m; m=m*m;
    vec3 x=2.0*fract(p* C.www)-1.0;
    vec3 h=abs(x)-0.5;
    vec3 ox=floor(x+0.5);
    vec3 a0=x-ox;
    m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
    vec3 g;
    g.x=a0.x*x0.x+h.x*x0.y;
    g.yz=a0.yz*x12.xz+h.yz*x12.yw;
    return 130.0*dot(m,g);
  }

  void main(){
    vUv=uv;
    vec3 pos=position;
    pos.z += snoise(vec2(pos.x*1.5+uTime*0.1, pos.y*1.5+uTime*0.1))*0.15;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
  }
`;

const waterFragment = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uDepthFade;
  varying vec2 vUv;

  void main(){
    float dist=distance(vUv,vec2(0.5));
    float strength=smoothstep(0.6,0.1,dist);
    float pulse=pow(0.5+0.5*sin((dist-uTime*0.2)*20.0),20.0);
    float edge=smoothstep(0.0,uDepthFade,dist);
    gl_FragColor=vec4(uColor, strength*pulse*0.8*edge);
  }
`;

function WaterPlane({ yPosition }) {
  const ref = useRef();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#00e7ff') },
      uDepthFade: { value: 1.5 },
    }),
    []
  );

  useFrame(({ clock }) => {
    if (ref.current) ref.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh
      position={[0, yPosition, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      frustumCulled={false}
      renderOrder={-3}
    >
      <planeGeometry args={[30, 30, 64, 64]} />
      <shaderMaterial
        ref={ref}
        vertexShader={waterVertex}
        fragmentShader={waterFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

/* ----- Ripple shader for core + nodes ----- */
const rippleVertex = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const rippleFragment = `
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float d = distance(vUv, vec2(0.5));
    float rim = smoothstep(0.48, 0.50, d) - smoothstep(0.50, 0.52, d);
    float waves = pow(max(0.0, 1.0 - d), 2.0) *
                  (0.35 + 0.65 * (0.5 + 0.5 * sin((1.0 - d) * 22.0 - uTime * 2.0)));
    float a = (rim + waves) * uIntensity;
    gl_FragColor = vec4(uColor, a);
  }
`;

function RippleRing({ position = [0, 0, 0], size = 3.2, color = '#6FEFFF', intensity = 0.9 }) {
  const mat = useRef();
  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.getElapsedTime();
  });
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    }),
    [color, intensity]
  );

  return (
    <mesh
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={-2}
      frustumCulled={false}
    >
      <planeGeometry args={[size, size, 1, 1]} />
      <shaderMaterial
        ref={mat}
        vertexShader={rippleVertex}
        fragmentShader={rippleFragment}
        uniforms={uniforms}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

/* -------------------- 3D Elements -------------------- */

function LightCore({ radius = 3, color = '#00e7ff', rim = '#96f7ff', onClick, energy = 1, y = 0 }) {
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
  }, [uniforms.uPulse]);

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += 0.12 * delta * (0.8 + 0.4 * uniforms.uPulse.value);
    uniforms.uTime.value += delta;
    uniforms.uPulse.value = THREE.MathUtils.lerp(uniforms.uPulse.value, 1, 0.05);

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
    <group ref={group} onClick={onClick} position={[0, y, 0]}>
      {/* Invisible occluder to hide lines behind the core */}
      <mesh renderOrder={0}>
        <sphereGeometry args={[radius * 0.99, 32, 32]} />
        <meshBasicMaterial depthWrite colorWrite={false} />
      </mesh>
      <mesh renderOrder={1}>
        <sphereGeometry args={[radius, 96, 96]} />
        <shaderMaterial
          vertexShader={coreVertex}
          fragmentShader={coreFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh ref={atmoRef} scale={1.055} renderOrder={2}>
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

function SynapticLinkTraveler({ start, mid, end, color, offset = 0, duration = 3 }) {
  const dot = useRef();
  const curve = useMemo(
    () =>
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(...start),
        new THREE.Vector3(...mid),
        new THREE.Vector3(...end)
      ),
    [start, mid, end]
  );

  useFrame(({ clock }) => {
    if (!dot.current) return;
    const t = ((clock.getElapsedTime() * 0.5) + offset) % duration / duration;
    curve.getPoint(t, dot.current.position);
  });

  return (
    <mesh ref={dot}>
      <sphereGeometry args={[0.05, 12, 12]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={3}
        toneMapped={false}
      />
    </mesh>
  );
}

function SynapticLinks({ selectedNode, events }) {
  if (!selectedNode || !selectedNode.position || !selectedNode.log || events.length === 0) return null;

  const links = useMemo(() => {
    const start = new THREE.Vector3(...selectedNode.position);
    return events.map((event, i) => {
      const angle = Math.PI / 2 + (i - (events.length - 1) / 2) * 0.5;
      const end = new THREE.Vector3(
        start.x + Math.cos(angle) * 3,
        start.y + 0.15,
        start.z + Math.sin(angle) * 3
      );
      const mid = new THREE.Vector3(
        (start.x + end.x) / 2,
        (start.y + end.y) / 2 + 0.8,
        (start.z + end.z) / 2
      );
      return { event, start, mid, end, key: `${event.event_time}-${i}` };
    });
  }, [selectedNode, events]);

  return (
    <group>
      {links.map(({ event, start, mid, end, key }, i) => {
        const color = EVENT_CONFIG[event.event_type]?.color || EVENT_CONFIG.Default.color;
        return (
          <group key={key}>
            <mesh position={end}>
              <sphereGeometry args={[0.15, 16, 16]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={1.5}
              />
            </mesh>
            <QuadraticBezierLine
              start={start}
              end={end}
              mid={mid}
              color="#00f0ff"
              lineWidth={1}
              transparent
              opacity={0.55}
              depthTest
            />
            <SynapticLinkTraveler
                start={start.toArray()}
                mid={mid.toArray()}
                end={end.toArray()}
                color={color}
                offset={i * 0.4}
              />
          </group>
        );
      })}
    </group>
  );
}

const DAY_SHELL_COLORS = [
  '#8EE7FF', // aqua
  '#7CA8FF', // indigo-blue
  '#9B7CFF', // violet
  '#6FFFD9', // mint
  '#64C7FF', // cyan-blue
  '#A7F3FF', // ice
  '#B29CFF', // lilac
];
const DOT_COLORS = { clarity: '#00f0ff', immune: '#ffd700', physical: '#00ff88' };

function DayNode({ node, position, onSelect, isSelected, isHovered, setHovered }) {
  const ref = useRef();
  useHoverCursor(isHovered);

  useFrame((state) => {
    if (!ref.current) return;
    const pulse =
      1 + Math.sin(state.clock.elapsedTime * 2.0) * 0.035 * (node.avg ? node.avg / 10 : 0.3);
    const target = (isSelected ? 1.5 : isHovered ? 1.2 : 1.0) * pulse;
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
        onSelect(node);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(node);
      }}
      onPointerOut={() => setHovered(null)}
    >
      <mesh>
        <sphereGeometry args={[0.7, 32, 32]} />
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
      <mesh position={[-0.1, 0.06, 0.08]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color={DOT_COLORS.clarity}
          emissive={DOT_COLORS.clarity}
          emissiveIntensity={brightness('clarity')}
          metalness={0.6}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0.1, 0.06, 0.08]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color={DOT_COLORS.immune}
          emissive={DOT_COLORS.immune}
          emissiveIntensity={brightness('immune')}
          metalness={0.6}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, -0.09, 0.08]}>
        <sphereGeometry args={[0.08, 16, 16]} />
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

function BeamTraveler({ start, mid, end, color, offset = 0 }) {
  const dot = useRef();
  const curve = useMemo(
    () =>
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(...start),
        new THREE.Vector3(...mid),
        new THREE.Vector3(...end)
      ),
    [start, mid, end]
  );

  useFrame(({ clock }) => {
    if (!dot.current) return;
    const t = (Math.sin(clock.getElapsedTime() * 1.2 + offset) + 1) * 0.5;
    curve.getPoint(t, dot.current.position);
  });

  return (
    <mesh ref={dot}>
      <sphereGeometry args={[0.09, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={1.8}
        metalness={0.6}
        roughness={0.2}
        toneMapped={false}
      />
    </mesh>
  );
}

function LightBeams({ nodes, energy = 1, coreRadius = 1, ringY = 0 }) {
  const beams = useMemo(() => {
    return nodes.map((n) => {
      const end = new THREE.Vector3(...n.position);
      const dirXZ = new THREE.Vector2(end.x, end.z).normalize();
      const start = new THREE.Vector3(dirXZ.x * coreRadius, ringY, dirXZ.y * coreRadius);

      const mid = new THREE.Vector3((start.x + end.x) * 0.5, ringY + 0.6, (start.z + end.z) * 0.5);

      const r = Math.hypot(mid.x, mid.z) || 1;
      const push = 1.2;
      mid.x *= 1 + push / r;
      mid.z *= 1 + push / r;

      return {
        start: start.toArray(),
        mid: mid.toArray(),
        end: end.toArray(),
        key: n.key,
        color: n.color,
      };
    });
  }, [nodes, coreRadius, ringY]);

  return (
    <group>
      {beams.map((b, i) => (
        <group key={b.key}>
          <QuadraticBezierLine
            start={b.start}
            end={b.end}
            mid={b.mid}
            color={b.color}
            lineWidth={1}
            transparent
            opacity={0.3 + 0.2 * energy}
            depthTest
          />
          <BeamTraveler start={b.start} mid={b.mid} end={b.end} color={b.color} offset={i * 0.7} />
        </group>
      ))}
    </group>
  );
}

function WeekRing({
  weekNodes,
  onSelect,
  hovered,
  setHovered,
  selected,
  onDragStateChange,
  onPositionsChange,
  ringY = -3.2,
  ringRadius = 7.5,
  coreRadius = 3.4,
}) {
  const SLOTS = 7;

  const slots = useMemo(() => {
    const arr = [];
    for (let i = 0; i < SLOTS; i++) {
      const a = (i / SLOTS) * Math.PI * 2;
      arr.push([ringRadius * Math.cos(a), ringY, ringRadius * Math.sin(a)]);
    }
    return arr;
  }, [ringRadius, ringY]);

  const [offset, setOffset] = useState(0);
  const targetOffset = useRef(0);
  const drag = useRef({ active: false, startX: 0 });

  useFrame(() => {
    const current = offset;
    const target = targetOffset.current;
    const lerped = THREE.MathUtils.lerp(current, target, 0.12);
    if (Math.abs(target - lerped) > 1e-3) {
      setOffset(lerped);
    } else if (current !== target) {
      setOffset(target);
    }
  });

  const items = useMemo(() => {
    const lerpPos = (a, b, t) => [a[0] * (1 - t) + b[0] * t, ringY, a[2] * (1 - t) + b[2] * t];
    return weekNodes.map((day, i) => {
      const getCircular = (val) => (val % SLOTS + SLOTS) % SLOTS;
      const dataIndex = getCircular(i - Math.round(offset));

      const x = getCircular(i - offset);
      const iA = Math.floor(x);
      const t = x - iA;
      const A = slots[iA];
      const B = slots[(iA + 1) % SLOTS];

      return { ...weekNodes[dataIndex], position: lerpPos(A, B, t) };
    });
  }, [weekNodes, offset, slots, ringY]);

  useEffect(() => {
    const map = new Map(items.map((n) => [n.key, n.position]));
    onPositionsChange?.(map);
  }, [items, onPositionsChange]);

  useEffect(() => {
    const move = (e) => {
      if (!drag.current.active) return;
      e.preventDefault();
      const dx = (e.clientX ?? 0) - drag.current.startX;
      const PIXELS_PER_SLOT = 180;
      targetOffset.current = drag.current.startOffset - dx / PIXELS_PER_SLOT;
    };
    const up = () => {
      if (!drag.current.active) return;
      drag.current.active = false;
      targetOffset.current = Math.round(targetOffset.current);
      onDragStateChange?.(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = 'auto';
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [onDragStateChange]);

  const startDrag = (e) => {
    e.stopPropagation();
    drag.current = { active: true, startX: e.clientX ?? 0, startOffset: targetOffset.current };
    onDragStateChange?.(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  };

  return (
    <group>
      {items.map((n) => (
        <group key={n.key}>
          <DayNode
            node={n}
            position={n.position}
            onSelect={() => onSelect(n)}
            isSelected={selected?.dayKey === n.key}
            isHovered={hovered?.dayKey === n.key}
            setHovered={setHovered}
          />
          <RippleRing
            position={[n.position[0], ringY, n.position[2]]}
            size={2.2}
            color="#78E7FF"
            intensity={0.8}
          />
        </group>
      ))}
      <LightBeams nodes={items} energy={1} coreRadius={coreRadius} ringY={ringY} />
      <mesh position={[0, ringY, 0]} rotation={[-Math.PI / 2, 0, 0]} onPointerDown={startDrag}>
        <torusGeometry args={[ringRadius, 0.8, 8, 96]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function LogEntryButton({ onClick }) {
  const [hovered, setHovered] = useState(false);
  useHoverCursor(hovered);
  return (
    <Float speed={4} floatIntensity={1.5}>
      <group
        position={[0, -7.5, 0]}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <mesh>
          <torusGeometry args={[0.8, 0.15, 16, 100]} />
          <meshStandardMaterial
            color="#00f0ff"
            emissive="#00f0ff"
            emissiveIntensity={hovered ? 2 : 1}
            roughness={0.2}
            metalness={0.8}
          />
        </mesh>
        <Text color="white" fontSize={0.3} position={[0, 0, 0]}>
          + LOG
        </Text>
      </group>
    </Float>
  );
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
  const [isDragging, setIsDragging] = useState(false);
  const [nodePositions, setNodePositions] = useState(new Map());

  const lastGuideRequestRef = useRef(0);

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
        setLatestScores({ clarity_score: 8, immune_score: 8, physical_readiness_score: 8 });
      }

      const { data: nudges } = nudgeRes;
      setActiveNudges(nudges || []);
      setIsLoading(false);

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
  }, []);

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
      } catch {}
    };
    tick();
    timer = setInterval(tick, STEPS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

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
    if (!latestScores) return { clarity: 0, immune: 0, physical: 0, energy: 1 };
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
          .update({ is_acknowledged: true, acknowledged_at: new Date().toISOString() })
          .eq('id', item.id);
        setActiveNudges((prev) => prev.filter((n) => n.id !== item.id));
      } catch {}
    }
  };

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
        log != null
          ? (Number(clarity || 0) + Number(immune || 0) + Number(physical || 0)) / 3
          : null;
      return {
        key,
        date: d,
        color: DAY_SHELL_COLORS[idx % DAY_SHELL_COLORS.length],
        scores: { clarity, immune, physical },
        avg,
        log,
      };
    });
  }, [logHistory]);

  const selectDay = (node) => {
    setSelectedItem({ dayKey: node.key, date: node.date, log: node.log || null, position: node.position });
  };

  const setHoveredDay = (nodeOrNull) => {
    setHoveredLog(nodeOrNull ? { dayKey: nodeOrNull.key } : null);
  };

  const [isPoweredUp, setIsPoweredUp] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsPoweredUp(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  const ringYPosition = -4.5;
  const coreRadius = 3.4;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      {isPoweredUp && (
        <LeftStack onSwitchView={onSwitchView} onOpenSettings={() => setDrawerOpen(true)} />
      )}
      {isPoweredUp && <GuidePanel guide={guideData} />}
      {isPoweredUp && <Hud item={selectedItem?.log || selectedItem} onClose={handleCloseHud} />}

      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onExport={onExport}
        onDelete={onDelete}
        onSetUIPref={onSetUIPref}
        currentUIPref={uiPref}
      />
      <LogEntryModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onLogSubmitted={fetchAllData}
        stepCount={stepCount}
      />

      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 2, 22], fov: 50 }}
      >
        <color attach="background" args={['#0a0a1a']} />
        <ambientLight intensity={0.18} />
        <pointLight position={[-10, 5, 5]} intensity={lightIntensities.clarity} color="#7FEAFF" />
        <pointLight position={[10, 5, 5]} intensity={lightIntensities.immune} color="#A0E7FF" />
        <pointLight position={[0, -10, 5]} intensity={lightIntensities.physical} color="#64FFD8" />

        <LightCore
          radius={coreRadius}
          color="#7CEBFF"
          rim="#CFF8FF"
          energy={lightIntensities.energy}
          y={ringYPosition}
        />

        {/* Water + core ripple */}
        <WaterPlane yPosition={ringYPosition} />
        <RippleRing
          position={[0, ringYPosition + 0.001, 0]}
          size={coreRadius * 2.1}
          color="#6FEFFF"
          intensity={1.0}
        />

        {isPoweredUp && !isLoading && (
          <>
            <WeekRing
              weekNodes={weekNodes}
              onSelect={selectDay}
              hovered={hoveredLog}
              setHovered={setHoveredDay}
              selected={selectedItem}
              onDragStateChange={setIsDragging}
              onPositionsChange={setNodePositions}
              ringY={ringYPosition}
              ringRadius={8.0}
              coreRadius={coreRadius}
            />
            <SynapticLinks
              selectedNode={
                selectedItem
                  ? {
                      ...selectedItem,
                      position:
                        nodePositions.get(selectedItem.dayKey) || selectedItem.position,
                    }
                  : null
              }
              events={dayEvents}
            />
            {activeNudges.map((nudge, idx) => (
              <AnomalyGlyph
                key={nudge.id}
                nudge={nudge}
                position={[-12, 4 - idx * 2.5, -6]}
                onGlyphClick={(n) => setSelectedItem(n)}
              />
            ))}
            <LogEntryButton onClick={() => setIsLogModalOpen(true)} />
          </>
        )}

        <OrbitControls
          enablePan={false}
          enableZoom
          enabled={!isDragging}
          autoRotate={false}
          minDistance={18}
          maxDistance={35}
          minPolarAngle={Math.PI / 2.8}
          maxPolarAngle={Math.PI / 2.1}
          minAzimuthAngle={-Math.PI / 6}
          maxAzimuthAngle={Math.PI / 6}
          enableDamping
          dampingFactor={0.05}
        />

        <EffectComposer multisampling={0}>
          <FXAA />
          <Bloom intensity={1.35} luminanceThreshold={0.42} luminanceSmoothing={0.85} />
          <DepthOfField focusDistance={0.015} focalLength={0.022} bokehScale={2.4} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

export default NeuralCortex;