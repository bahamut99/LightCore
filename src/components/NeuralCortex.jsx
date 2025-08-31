// src/components/NeuralCortex.jsx
// LightCore — Neural-Cortex view (7-day ring)
// - Shows exactly 7 day-nodes (last 7 local days) around a smaller LightCore
// - Each day node has 3 inner dots (clarity/immune/physical) with intensity by score
// - Neon beams from core to each day node
// - Left-side Settings drawer, accessible “X”, UI pref write-through

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Float, QuadraticBezierLine } from '@react-three/drei';
import { EffectComposer, Bloom, FXAA } from '@react-three/postprocessing';
import * as THREE from 'three';
import { supabase } from '../supabaseClient';
import LogEntryModal from './LogEntryModal.jsx';

/* ---------------------- Palette / Config ---------------------- */

const DOT_COLORS = {
  clarity: '#00f0ff',   // cyan
  immune:  '#ffd700',   // gold
  physical:'#00ff88',   // green
};

// 7 distinct “2077” base colors for day nodes
const DAY_BASE_COLORS = [
  '#00E5FF', // electric cyan
  '#7B61FF', // neon violet
  '#39FF14', // laser green
  '#FF3D81', // neon magenta
  '#00FFA3', // aqua lime
  '#FF8A00', // neon orange
  '#1EA7FF', // azure
];

// Steps polling every 120s (unchanged)
const STEPS_POLL_MS = 120000;

const hideScrollbarCSS = `
  * { scrollbar-width: none; -ms-overflow-style: none; }
  *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
`;

/* ------------------------- Utils ------------------------- */

function useHoverCursor(isHovered) {
  useEffect(() => {
    const prev = document.body.style.cursor;
    document.body.style.cursor = isHovered ? 'pointer' : 'auto';
    return () => (document.body.style.cursor = prev);
  }, [isHovered]);
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function toYMDLocal(dateLike) {
  const d = new Date(dateLike);
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function last7LocalDays() {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    out.push({ key: toYMDLocal(d), date: d });
  }
  return out; // oldest -> newest
}

function averageScores(rows) {
  if (!rows || rows.length === 0) return null;
  const tot = rows.reduce(
    (a, r) => {
      a.clarity += r.clarity_score || 0;
      a.immune += r.immune_score || 0;
      a.physical += r.physical_readiness_score || 0;
      return a;
    },
    { clarity: 0, immune: 0, physical: 0 }
  );
  const n = rows.length;
  return {
    clarity: tot.clarity / n,
    immune:  tot.immune  / n,
    physical:tot.physical / n,
  };
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
          left: 0, // <-- LEFT side
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
          {/* perfectly centered X */}
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
              display: 'grid',
              placeItems: 'center',
              lineHeight: 0,
            }}
          >
            <span style={{ display: 'inline-block', transform: 'translateY(-1px)' }}>×</span>
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
              }}
            >
              NEURAL-CORTEX
            </NeoButton>
            <NeoButton
              onClick={() => onSetUIPref('classic')}
              style={{
                flex: 1,
                borderColor: currentUIPref === 'classic' ? '#38e8ff' : 'rgba(0,240,255,0.35)',
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

/* ------------------------- Guide Panel (unchanged) ------------------------- */

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

/* ---------------------- Center LightCore ---------------------- */
/* 20% smaller than before: radius ~ 2.4 instead of 3 */

function LightCore({ onClick }) {
  const groupRef = useRef();
  const [hovered, setHovered] = useState(false);
  useHoverCursor(hovered);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += 0.001;
  });

  return (
    <group ref={groupRef}>
      <mesh
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <icosahedronGeometry args={[2.4, 5]} />
        <meshStandardMaterial color="#bfefff" metalness={0.9} roughness={0.05} />
      </mesh>
      {/* Glow shell */}
      <mesh
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <icosahedronGeometry args={[2.44, 5]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.35} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

/* ---------------------- Day Nodes (7 ring) ---------------------- */

function ScoreDot({ color, pos, score }) {
  // Map 0..10 -> emissive intensity 0.25 .. 2.2
  const intensity = 0.25 + (clamp(score ?? 0, 0, 10) / 10) * 1.95;
  return (
    <mesh position={pos}>
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={intensity}
        metalness={0.7}
        roughness={0.2}
      />
    </mesh>
  );
}

function DayNode({ position, baseColor, day, onClick }) {
  const [hovered, setHovered] = useState(false);
  useHoverCursor(hovered);

  // Inner dot layout (triangle)
  const r = 0.32;
  const dots = [
    { key: 'clarity',  color: DOT_COLORS.clarity,  pos: [ r, 0, 0],     score: day?.scores?.clarity  ?? 0 },
    { key: 'immune',   color: DOT_COLORS.immune,   pos: [-r * 0.6,  r, 0], score: day?.scores?.immune   ?? 0 },
    { key: 'physical', color: DOT_COLORS.physical, pos: [-r * 0.6, -r, 0], score: day?.scores?.physical ?? 0 },
  ];

  return (
    <group
      position={position}
      onClick={() => onClick?.(day)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Outer neon ring */}
      <mesh>
        <torusGeometry args={[0.7, 0.07, 16, 48]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={hovered ? 2.2 : 1.5}
          metalness={0.9}
          roughness={0.15}
        />
      </mesh>

      {/* Inner 3 score dots */}
      {dots.map((d) => (
        <ScoreDot key={d.key} color={d.color} pos={d.pos} score={d.score} />
      ))}
    </group>
  );
}

function DayRing({ days, radius = 7, onSelect }) {
  const total = days.length;
  // oldest -> newest clockwise, start at roughly top (-90° offset)
  return (
    <group>
      {days.map((day, i) => {
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
        const pos = [radius * Math.cos(angle), radius * Math.sin(angle), 0];
        const baseColor = DAY_BASE_COLORS[i % DAY_BASE_COLORS.length];

        return (
          <group key={day.key}>
            {/* Beam from core to node */}
            <QuadraticBezierLine
              start={[0, 0, 0]}
              end={pos}
              mid={[pos[0] * 0.5, pos[1] * 0.5 + 0.8, 0]}
              color="#00f0ff"
              lineWidth={1}
              transparent
              opacity={0.45}
            />
            <DayNode position={pos} baseColor={baseColor} day={day} onClick={onSelect} />
          </group>
        );
      })}
    </group>
  );
}

/* ---------------------- + LOG button ---------------------- */

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
  const [selectedDay, setSelectedDay] = useState(null);
  const [stepCount, setStepCount] = useState(null);
  const [guideData, setGuideData] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uiPref, setUiPref] = useState('neural');

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
    const { data: { session } } = await supabase.auth.getSession();
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
      if (json) setGuideData(json);
      return json;
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

      if (!guideData) requestGuidance().catch(() => {});

      // Pull enough logs to cover at least 7 local days
      const { data: logs } = await supabase
        .from('daily_logs')
        .select('id, created_at, clarity_score, immune_score, physical_readiness_score, ai_notes')
        .order('created_at', { ascending: false })
        .limit(60);

      if (logs && logs.length > 0) {
        setLogHistory(logs);

        // "latest" = latest row
        setLatestScores({
          clarity_score: logs[0]?.clarity_score ?? 8,
          immune_score: logs[0]?.immune_score ?? 8,
          physical_readiness_score: logs[0]?.physical_readiness_score ?? 8,
        });
      } else {
        setLatestScores({ clarity_score: 8, immune_score: 8, physical_readiness_score: 8 });
      }

      setIsLoading(false);

      // One-off steps fetch (local timezone)
      fetchWithTimeout(
        (async () => {
          const headers = await getAuthHeader();
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          return fetch(
            `/.netlify/functions/fetch-health-data?tz=${encodeURIComponent(tz)}`,
            { headers }
          ).then((r) => (r.ok ? r.json() : null));
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
          setLogHistory((prev) => [payload.new, ...prev].slice(0, 60));
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

  // Steps polling every 120s
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

  // Build 7-day aggregation (local)
  const sevenDays = useMemo(() => {
    const days = last7LocalDays(); // oldest -> newest
    const grouped = new Map(); // key -> rows
    for (const log of logHistory) {
      const key = toYMDLocal(log.created_at);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(log);
    }
    return days.map((d, idx) => {
      const rows = grouped.get(d.key) || [];
      const scores = averageScores(rows); // null if none
      return {
        key: d.key,
        date: d.date,
        scores, // {clarity, immune, physical} or null
        color: DAY_BASE_COLORS[idx % DAY_BASE_COLORS.length],
      };
    });
  }, [logHistory]);

  const lightIntensities = useMemo(() => {
    if (!latestScores) return { clarity: 0, immune: 0, physical: 0 };
    const clamp10 = (v) => Math.min(10, v || 0);
    return {
      clarity: clamp10(latestScores.clarity_score) * 30,
      immune: clamp10(latestScores.immune_score) * 30,
      physical: clamp10(latestScores.physical_readiness_score) * 30,
    };
  }, [latestScores]);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ preferred_view: view }).eq('id', user.id);
      }
    } catch {}
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      <LeftStack onSwitchView={onSwitchView} onOpenSettings={handleOpenSettings} />
      <GuidePanel guide={guideData} />

      <SettingsDrawer
        open={drawerOpen}
        onClose={handleCloseSettings}
        onExport={onExport}
        onDelete={onDelete}
        onSetUIPref={onSetUIPref}
        currentUIPref={uiPref}
      />

      <LogEntryModal
        isOpen={false}
        onClose={() => {}}
        onLogSubmitted={() => {}}
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
            {/* Smaller central core */}
            <LightCore onClick={() => {}} />

            {/* 7-day ring + beams */}
            <DayRing days={sevenDays} radius={7} onSelect={(d) => setSelectedDay(d)} />

            {/* +LOG button */}
            <LogEntryButton onClick={() => window.dispatchEvent(new CustomEvent('openLogModal'))} />
          </>
        )}

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          autoRotate={true}
          autoRotateSpeed={0.3}
          onStart={() => clearTimeout(idleRef.current)}
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
