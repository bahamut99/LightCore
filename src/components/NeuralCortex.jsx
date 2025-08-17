// src/components/NeuralCortex.jsx
// LightCore v2025-08-17 build-08 — Neural-Cortex 3D UI (pinned guide, left header, unified buttons)
// Purpose: 3D "mind map" UI with feature parity to Classic, privacy-forward overlays.
// Changes:
// - Pinned, always-visible GuidePanel on the right (no close button).
// - Request guidance on load (parallel), and after new logs (throttled).
// - Header controls moved to top-left; unified “NeoButton” style (same height).
// - HUD for logs/nudges uses a header bar; close “×” truly top-right and not over text.

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Float, QuadraticBezierLine } from '@react-three/drei';
import { EffectComposer, Bloom, FXAA } from '@react-three/postprocessing';
import { supabase } from '../supabaseClient';
import * as THREE from 'three';
import LogEntryModal from './LogEntryModal.jsx';

const EVENT_CONFIG = {
  Workout: { color: '#4ade80' },
  Meal: { color: '#facc15' },
  Caffeine: { color: '#f97316' },
  Default: { color: '#a78bfa' },
};

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
    return () => (document.body.style.cursor = prev);
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

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
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

function NeoButton({ as = 'button', href, children, onClick, title }) {
  const [hover, setHover] = useState(false);
  const style = {
    ...neoBtnStyle,
    boxShadow: hover ? '0 0 12px rgba(0,240,255,0.35)' : '0 0 6px rgba(0,240,255,0.15)',
    borderColor: hover ? 'rgba(0,240,255,0.6)' : neoBtnStyle.border.split(':')[2]?.trim(),
    transform: hover ? 'translateY(-1px)' : 'translateY(0)',
  };
  if (as === 'a') {
    return (
      <a
        href={href}
        title={title}
        style={style}
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
      style={style}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </button>
  );
}

function TopLeftControls({ onSwitchView }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '2rem',
        left: '2rem',
        zIndex: 12,
        display: 'flex',
        gap: '0.75rem',
      }}
    >
      <NeoButton as="a" href="/settings.html" title="Open Settings">
        SETTINGS
      </NeoButton>
      <NeoButton onClick={onSwitchView} title="Switch to Classic Dashboard">
        CLASSIC VIEW
      </NeoButton>
    </div>
  );
}

/* ------------------------- Guide Panel ------------------------- */
function GuidePanel({ guide }) {
  const g = guide || {
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
          maxHeight: '18vh',
          overflowY: 'auto',
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
            maxHeight: '20vh',
            overflowY: 'auto',
            paddingRight: '0.5rem',
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
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              maxHeight: '18vh',
              overflowY: 'auto',
              paddingRight: '0.5rem',
            }}
          >
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

/* ------------------------- Privacy Panel ------------------------- */
function PrivacyPanel({ getAuthHeader }) {
  const [busy, setBusy] = useState(false);

  const callFn = async (path) => {
    try {
      setBusy(true);
      const headers = await getAuthHeader();
      const res = await fetch(path, { headers });
      if (res?.ok) {
        window.alert('Request received. Check your email or downloads shortly.');
      } else {
        window.alert('Feature not available yet.');
      }
    } catch {
      window.alert('Unable to complete request right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '1.5rem',
        right: '2rem',
        zIndex: 10,
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <span
        title="Your data is stored with RLS; no selling of data."
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '0.7rem',
          color: '#7dd3fc',
          background: 'rgba(10, 25, 47, 0.7)',
          border: '1px solid rgba(0, 240, 255, 0.2)',
          padding: '0.5rem 0.75rem',
          borderRadius: '10px',
          backdropFilter: 'blur(6px)',
        }}
      >
        PRIVACY: Local UI • RLS-protected
      </span>
      <NeoButton onClick={() => callFn('/.netlify/functions/export-user-data')}>EXPORT MY DATA</NeoButton>
      <NeoButton onClick={() => callFn('/.netlify/functions/delete-my-data')}>DELETE ACCOUNT</NeoButton>
    </div>
  );
}

/* ------------------------- HUD (Logs/Nudges) ------------------------- */
function Hud({ item, onClose }) {
  // Only for logs and nudges; guide is now a dedicated panel
  if (!item) return null;

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
        padding: '1rem 1rem 1rem',
        fontFamily: "'Roboto Mono', monospace",
        fontSize: '14px',
        zIndex: 11,
        maxHeight: '70vh',
        overflow: 'hidden',
      }}
    >
      {/* Header bar prevents overlap; close at real top-right */}
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
          {isLog ? `LOG ENTRY: ${fmtDate(logObj.created_at)}` : `ANOMALY: ${item.headline?.toUpperCase?.() ?? ''}`}
        </h2>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          aria-label="Close"
          title="Close"
          style={{
            width: 32,
            height: 32,
            lineHeight: '28px',
            textAlign: 'center',
            fontSize: '18px',
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

      <div
        className="hud-scroll"
        style={{
          maxHeight: '52vh',
          overflowY: 'auto',
          paddingRight: '0.5rem',
        }}
      >
        {isLog && (
          <p style={{ color: 'white', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{logObj.ai_notes}</p>
        )}
        {isNudge && (
          <p style={{ color: 'white', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{item.body_text}</p>
        )}
      </div>
    </div>
  );
}

/* ---------------------- Shaders ---------------------- */
// Soft Fresnel rim, alpha-only glow, brightens on hover (no milky interior)
const fresnelVertex = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 wPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = wPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fresnelFragment = `
  uniform float uHover;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float ndotv = max(dot(normalize(vNormal), viewDir), 0.0);
    float fresnel = pow(1.0 - ndotv, 2.0);
    float rim = smoothstep(0.15, 1.0, fresnel);
    float alpha = rim * 0.35 * mix(1.0, 2.1, clamp(uHover, 0.0, 1.0));
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/* -------------------- 3D Elements -------------------- */
function Locus({ onLocusClick }) {
  const groupRef = useRef();
  const [hovered, setHovered] = useState(false);
  useHoverCursor(hovered);

  const uniforms = useMemo(
    () => ({
      uHover: { value: 0.0 },
      uColor: { value: new THREE.Color('#00f0ff') },
    }),
    []
  );

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += 0.001;
    uniforms.uHover.value = THREE.MathUtils.lerp(uniforms.uHover.value, hovered ? 1.0 : 0.0, 0.18);
  });

  return (
    <group ref={groupRef}>
      {/* Core – receives events */}
      <mesh onClick={onLocusClick} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <icosahedronGeometry args={[3, 5]} />
        <meshStandardMaterial color="#f0f0f0" metalness={0.9} roughness={0.05} />
      </mesh>

      {/* Rim shell – receives events */}
      <mesh onClick={onLocusClick} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <icosahedronGeometry args={[3.03, 5]} />
        <shaderMaterial
          vertexShader={fresnelVertex}
          fragmentShader={fresnelFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
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

function LogNode({ log, position, setSelectedItem, isSelected, setHoveredLog, isHovered }) {
  const ref = useRef();
  useHoverCursor(isHovered);

  const dynamic = useMemo(() => {
    const avg =
      ((log.clarity_score || 0) + (log.immune_score || 0) + (log.physical_readiness_score || 0)) /
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

function LogEntryButton({ onClick }) {
  const [hovered, setHovered] = useState(false);
  useHoverCursor(hovered);

  return (
    <Float speed={4} floatIntensity={1.5}>
      <group
        position={[0, -5, 0]}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <mesh>
          <torusGeometry args={[0.6, 0.1, 16, 100]} />
        </mesh>
        <mesh>
          <meshStandardMaterial
            color="#00f0ff"
            emissive="#00f0ff"
            emissiveIntensity={hovered ? 2 : 1}
            roughness={0.2}
            metalness={0.8}
          />
        </mesh>
        <Text color="white" fontSize={0.2} position={[0, 0, 0]}>
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
  const [selectedItem, setSelectedItem] = useState(null); // logs/nudges only
  const [hoveredLog, setHoveredLog] = useState(null);
  const [dayEvents, setDayEvents] = useState([]);
  const [activeNudges, setActiveNudges] = useState([]);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [stepCount, setStepCount] = useState(null);
  const [guideData, setGuideData] = useState(null);

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

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const requestGuidance = async () => {
    try {
      const now = Date.now();
      if (now - lastGuideRequestRef.current < 15000) return null; // throttle to 15s
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsLoading(false);
        return;
      }

      // Start guidance immediately (parallel) so the panel fills ASAP
      if (!guideData) {
        // show placeholder instantly; real data will hydrate when ready
        setGuideData(null);
        requestGuidance().catch(() => {});
      }

      const [logRes, nudgeRes] = await Promise.all([
        supabase
          .from('daily_logs')
          .select('id, created_at, clarity_score, immune_score, physical_readiness_score, tags, ai_notes')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase.from('nudges').select('*').eq('is_acknowledged', false),
      ]);

      const { data: logs, error: logError } = logRes;
      if (logError) console.error('Error fetching logs:', logError);
      if (logs && logs.length > 0) {
        setLogHistory(logs);
        setLatestScores({ ...logs[0] });
      } else {
        setLatestScores({ clarity_score: 8, immune_score: 8, physical_readiness_score: 8 });
      }

      const { data: nudges, error: nudgeError } = nudgeRes;
      if (nudgeError) console.error('Error fetching nudges:', nudgeError);
      setActiveNudges(nudges || []);

      setIsLoading(false); // render scene

      // Non-blocking extras
      fetchWithTimeout(
        (async () => {
          const headers = await getAuthHeader();
          return fetch('/.netlify/functions/fetch-health-data', { headers }).then((r) =>
            r.ok ? r.json() : null
          );
        })(),
        6000
      )
        .then((stepRes) => {
          if (stepRes?.steps) setStepCount(stepRes.steps);
        })
        .catch(() => {});
    } catch (e) {
      console.error('fetchAllData failed:', e);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();

    const channel = supabase
      .channel('realtime:daily_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_logs' }, (payload) => {
        setLogHistory((prev) => [payload.new, ...prev].slice(0, 30));
        setLatestScores({ ...payload.new });
        // refresh guide on new logs (throttled)
        requestGuidance().catch(() => {});
      })
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
    if (selectedItem && selectedItem.log) {
      (async () => {
        const { data, error } = await supabase
          .from('events')
          .select('event_type, event_time')
          .eq('log_id', selectedItem.log.id);
        if (error) console.error('Error fetching events:', error);
        else setDayEvents(data || []);
      })();
    } else {
      setDayEvents([]);
    }
  }, [selectedItem]);

  const lightIntensities = useMemo(() => {
    if (!latestScores) return { clarity: 0, immune: 0, physical: 0 };
    const clamp10 = (v) => Math.min(10, v || 0);
    return {
      clarity: clamp10(latestScores.clarity_score) * 30,
      immune: clamp10(latestScores.immune_score) * 30,
      physical: clamp10(latestScores.physical_readiness_score) * 30,
    };
  }, [latestScores]);

  const handleCloseHud = async () => {
    // If a nudge is open, acknowledge it on close.
    const item = selectedItem;
    setSelectedItem(null);
    if (item?.id && (item?.headline || item?.body_text)) {
      try {
        await supabase
          .from('nudges')
          .update({ is_acknowledged: true, acknowledged_at: new Date().toISOString() })
          .eq('id', item.id);
        setActiveNudges((prev) => prev.filter((n) => n.id !== item.id));
      } catch (e) {
        console.warn('Failed to ack nudge');
      }
    }
  };

  const handleLogSubmitted = () => setIsLogModalOpen(false);

  const handleLocusClick = async () => {
    // Manual refresh hook: click the core to refresh guidance now
    await requestGuidance();
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      {/* Left header controls */}
      <TopLeftControls onSwitchView={onSwitchView} />

      {/* Pinned guide panel on the right */}
      <GuidePanel guide={guideData} />

      {/* HUD for logs/nudges only */}
      <Hud item={selectedItem} onClose={handleCloseHud} />

      {/* Privacy quick-actions */}
      <PrivacyPanel getAuthHeader={getAuthHeader} />

      <LogEntryModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onLogSubmitted={handleLogSubmitted}
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
            <Locus onLocusClick={handleLocusClick} />
            <Constellation
              logs={logHistory}
              setSelectedItem={setSelectedItem}
              selectedItem={selectedItem}
              setHoveredLog={setHoveredLog}
              hoveredLog={hoveredLog}
            />
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
          enablePan={false}
          enableZoom={true}
          autoRotate={autoRotate}
          autoRotateSpeed={0.3}
          onStart={() => {
            setAutoRotate(false);
            clearTimeout(idleRef.current);
          }}
          onEnd={() => {
            clearTimeout(idleRef.current);
            idleRef.current = setTimeout(() => setAutoRotate(true), 4000);
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

/*
How to test:
1) Load Neural-Cortex: Guide panel appears on the right immediately with “Generating…” then fills when the function returns.
2) Click the central core → guidance refresh (throttled).
3) Add a log → a new node shows; guide refreshes automatically within a moment.
4) Header buttons are top-left, identical height/visual style (no overlap with guide).
5) Open a log or nudge → left HUD opens; close “×” is top-right of the HUD header, not over the title.
6) Guide panel cannot be closed (by design).
*/
