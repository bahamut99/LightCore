// src/components/NeuralCortex.jsx
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

/* ------------------------- HUD ------------------------- */
function Hud({ item, onClose }) {
  if (!item) return null;

  const logObj = item?.ai_notes ? item : item?.log;
  const isLog = !!logObj?.created_at || !!logObj?.ai_notes;
  const isNudge = !!item?.headline;
  const isGuide = !!item?.current_state;

  const when = (d) =>
    new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let title = 'SYSTEM DATA';
  if (isLog) title = `LOG ENTRY: ${when(logObj.created_at)}`;
  if (isNudge) title = `ANOMALY: ${item.headline?.toUpperCase?.() ?? ''}`;
  if (isGuide) title = 'LIGHTCORE GUIDE';

  const wrapStyle = {
    position: 'absolute',
    top: '2rem',
    ...(isGuide ? { right: '2rem' } : { left: '2rem' }),
    width: '400px',
    color: '#00f0ff',
    background: 'rgba(10, 25, 47, 0.7)',
    border: '1px solid rgba(0, 240, 255, 0.2)',
    backdropFilter: 'blur(10px)',
    borderRadius: '0.5rem',
    padding: '1.5rem',
    fontFamily: "'Roboto Mono', monospace",
    fontSize: '14px',
    animation: 'fadeIn 0.5s ease-out',
    zIndex: 10,
  };

  return (
    <>
      <style>{`.hud-scroll::-webkit-scrollbar{display:none}.hud-scroll{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <div style={wrapStyle}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
            background: 'none',
            border: 'none',
            color: '#00f0ff',
            fontSize: '1.5rem',
            cursor: 'pointer',
          }}
        >
          &times;
        </button>

        <h2
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '1.25rem',
            textShadow: '0 0 5px #00f0ff',
            marginBottom: '1rem',
          }}
        >
          {title}
        </h2>

        {isGuide && (
          <p
            className="hud-scroll"
            style={{
              color: 'white',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.6',
              fontStyle: 'italic',
              marginBottom: '1rem',
            }}
          >
            {item.current_state}
          </p>
        )}

        <div
          className="hud-scroll"
          style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '1rem', marginBottom: '1rem' }}
        >
          {isLog && (
            <p style={{ color: 'white', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
              {logObj.ai_notes}
            </p>
          )}
          {isNudge && (
            <p style={{ color: 'white', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{item.body_text}</p>
          )}
          {isGuide &&
            (item.positives || []).map((p) => (
              <p key={p} style={{ color: '#00ff88' }}>
                + {p}
              </p>
            ))}
          {isGuide &&
            (item.concerns || []).map((c) => (
              <p key={c} style={{ color: '#ffd700' }}>
                - {c}
              </p>
            ))}
        </div>

        {isGuide && item.suggestions?.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(0,240,255,0.2)', paddingTop: '1rem' }}>
            <h3 style={{ fontFamily: "'Orbitron', sans-serif", marginBottom: '0.75rem' }}>SUGGESTIONS</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {item.suggestions.map((s) => (
                <span
                  key={s}
                  style={{
                    background: 'rgba(0,240,255,0.1)',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '99px',
                    fontSize: '12px',
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
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

  const over = (e) => {
    e.stopPropagation();
    setHovered(true);
  };
  const out = (e) => {
    e.stopPropagation();
    setHovered(false);
  };
  const click = (e) => {
    e.stopPropagation();
    onLocusClick?.();
  };

  return (
    <group ref={groupRef}>
      {/* Core – receives events */}
      <mesh onClick={click} onPointerOver={over} onPointerOut={out}>
        <icosahedronGeometry args={[3, 5]} />
        <meshStandardMaterial color="#f0f0f0" metalness={0.9} roughness={0.05} />
      </mesh>

      {/* Rim shell – receives events */}
      <mesh onClick={click} onPointerOver={over} onPointerOut={out}>
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
      const end = new THREE.Vector3(start.x + Math.cos(angle) * 3, start.y + Math.sin(angle) * 3, start.z);
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
          key={log.created_at}
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
  const [selectedItem, setSelectedItem] = useState(null);
  const [hoveredLog, setHoveredLog] = useState(null);
  const [dayEvents, setDayEvents] = useState([]);
  const [activeNudges, setActiveNudges] = useState([]);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [stepCount, setStepCount] = useState(null);
  const [guideData, setGuideData] = useState(null);
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

  const requestGuidance = async (authHeader) => {
    try {
      const json = await fetchWithTimeout(
        fetch('/.netlify/functions/generate-guidance', {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
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
      if (!session) { setIsLoading(false); return; }
      const authHeader = { Authorization: `Bearer ${session.access_token}` };

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

      // Background fetches that shouldn't block UI
      fetchWithTimeout(
        fetch('/.netlify/functions/fetch-health-data', { headers: authHeader }).then((r) => (r.ok ? r.json() : null)),
        6000
      )
        .then((stepRes) => {
          if (stepRes?.steps) setStepCount(stepRes.steps);
        })
        .catch(() => {});

      requestGuidance(authHeader).catch(() => {});
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

  // Auto-open the guide once it first arrives (if nothing else is open)
  useEffect(() => {
    if (guideData && !selectedItem) setSelectedItem(guideData);
  }, [guideData, selectedItem]);

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

  const handleLogSubmitted = () => setIsLogModalOpen(false);

  const handleLocusClick = async () => {
    if (guideData) {
      setSelectedItem(guideData);
      return;
    }
    // Show a friendly placeholder immediately
    const placeholder = {
      current_state: 'Generating your guidance…',
      positives: [],
      concerns: [],
      suggestions: ['Keep logging—your personalized guide is being prepared.'],
    };
    setSelectedItem(placeholder);

    const { data: { session } } = await supabase.auth.getSession();
    const header = session ? { Authorization: `Bearer ${session.access_token}` } : {};
    const g = await requestGuidance(header);
    if (g) setSelectedItem(g);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      <Hud item={selectedItem} onClose={() => setSelectedItem(null)} />

      <div style={{ position: 'absolute', top: '2rem', right: '2rem', zIndex: 10, display: 'flex', gap: '1rem' }}>
        <a
          href="/settings.html"
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '0.8rem',
            color: '#9CA3AF',
            background: 'rgba(10, 25, 47, 0.7)',
            border: '1px solid rgba(0, 240, 255, 0.2)',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            backdropFilter: 'blur(5px)',
            textDecoration: 'none',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.5)')}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.2)')}
        >
          SETTINGS
        </a>
        <button
          onClick={onSwitchView}
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '0.8rem',
            color: '#9CA3AF',
            background: 'rgba(10, 25, 47, 0.7)',
            border: '1px solid rgba(0, 240, 255, 0.2)',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            backdropFilter: 'blur(5px)',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.5)')}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.2)')}
        >
          CLASSIC VIEW
        </button>
      </div>

      <LogEntryModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onLogSubmitted={handleLogSubmitted}
        stepCount={stepCount}
      />

      <Canvas dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }} camera={{ position: [0, 0, 12], fov: 75 }}>
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
              <AnomalyGlyph key={nudge.id} nudge={nudge} position={[-8, 4 - idx * 2, -5]} onGlyphClick={setSelectedItem} />
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
