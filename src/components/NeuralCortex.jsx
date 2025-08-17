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

// ---------- UTIL ----------
function normalizeGuidance(raw) {
  if (!raw) return null;
  const g = raw.guidance_for_user || raw.lightcoreGuide || raw.guidance || raw.guide || raw;
  if (!g) return null;
  return {
    current_state: g.current_state || g.currentState || g.summary || g.message || '',
    positives: g.positives || g.strengths || [],
    concerns: g.concerns || g.risks || g.issues || [],
    suggestions: g.suggestions || g.actions || g.recommendations || [],
  };
}

function useHoverCursor(isHovered) {
  useEffect(() => {
    const originalCursor = document.body.style.cursor;
    document.body.style.cursor = isHovered ? 'pointer' : 'auto';
    return () => { document.body.style.cursor = originalCursor; };
  }, [isHovered]);
}

// ---------- HUD ----------
function Hud({ item, onClose }) {
  if (!item) return null;

  // Accept either a plain log object or { log, position }
  const logObj = item?.ai_notes ? item : item?.log;
  const isLog = !!logObj?.ai_notes || !!logObj?.created_at;
  const isNudge = !!item?.headline;
  const isGuide = !!item?.current_state;

  const formatDate = (d) =>
    new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let title = 'SYSTEM DATA';
  if (isLog) title = `LOG ENTRY: ${formatDate(logObj.created_at)}`;
  if (isNudge) title = `ANOMALY: ${item.headline?.toUpperCase?.() ?? ''}`;
  if (isGuide) title = 'LIGHTCORE GUIDE';

  return (
    <>
      <style>{`.hud-scroll::-webkit-scrollbar { display: none; } .hud-scroll { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
      <div style={{
        position: 'absolute', top: '2rem', left: '2rem', width: '400px', color: '#00f0ff',
        background: 'rgba(10, 25, 47, 0.7)', border: '1px solid rgba(0, 240, 255, 0.2)',
        backdropFilter: 'blur(10px)', borderRadius: '0.5rem', padding: '1.5rem',
        fontFamily: "'Roboto Mono', monospace", fontSize: '14px', animation: 'fadeIn 0.5s ease-out', zIndex: 10
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'none',
          border: 'none', color: '#00f0ff', fontSize: '1.5rem', cursor: 'pointer'
        }}>&times;</button>

        <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '1.25rem', textShadow: '0 0 5px #00f0ff', marginBottom: '1rem' }}>
          {title}
        </h2>

        {isGuide && (
          <p className="hud-scroll" style={{ color: 'white', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontStyle: 'italic', marginBottom: '1rem' }}>
            {item.current_state}
          </p>
        )}

        <div className="hud-scroll" style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '1rem', marginBottom: '1rem' }}>
          {isLog && (<p style={{ color: 'white', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{logObj.ai_notes}</p>)}
          {isNudge && (<p style={{ color: 'white', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{item.body_text}</p>)}
          {isGuide && (item.positives || []).map((p) => (<p key={p} style={{ color: '#00ff88' }}>+ {p}</p>))}
          {isGuide && (item.concerns || []).map((c) => (<p key={c} style={{ color: '#ffd700' }}>- {c}</p>))}
        </div>

        <div style={{ borderTop: '1px solid rgba(0, 240, 255, 0.2)', paddingTop: '1rem' }}>
          <h3 style={{ fontFamily: "'Orbitron', sans-serif", marginBottom: '0.75rem' }}>
            {isLog ? 'TAGS' : (isNudge ? 'SUGGESTED ACTIONS' : 'SUGGESTIONS')}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {isLog && (logObj.tags || []).map((tag) => (
              <span key={tag} style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '99px', fontSize: '12px' }}>{tag}</span>
            ))}
            {isNudge && (item.suggested_actions || []).map((action) => (
              <span key={action} style={{ background: 'rgba(255, 77, 77, 0.2)', padding: '0.25rem 0.75rem', borderRadius: '99px', fontSize: '12px' }}>{action}</span>
            ))}
            {isGuide && (item.suggestions || []).map((s) => (
              <span key={s} style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '99px', fontSize: '12px' }}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- SHADERS ----------
const vertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = `
  uniform float uHover;
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    intensity += uHover * 0.5;
    gl_FragColor = vec4(uColor, 1.0) * intensity;
  }
`;

// ---------- 3D ELEMENTS ----------
function Locus({ onLocusClick }) {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);
  useHoverCursor(hovered);

  const uniforms = useMemo(() => ({
    uHover: { value: 0.0 },
    uColor: { value: new THREE.Color('#00f0ff') },
  }), []);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001;
      uniforms.uHover.value = THREE.MathUtils.lerp(uniforms.uHover.value, hovered ? 1.0 : 0.0, 0.1);
    }
  });

  return (
    <>
      <mesh
        ref={meshRef}
        onClick={onLocusClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <icosahedronGeometry args={[3, 5]} />
        <meshStandardMaterial color="#f0f0f0" metalness={0.9} roughness={0.05} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[3.01, 5]} />
        <shaderMaterial
          fragmentShader={fragmentShader}
          vertexShader={vertexShader}
          uniforms={uniforms}
          transparent
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

function AnomalyGlyph({ nudge, position, onGlyphClick }) {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);
  useHoverCursor(hovered);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
      const time = state.clock.getElapsedTime();
      meshRef.current.position.y = position[1] + Math.sin(time) * 0.2;
    }
  });

  return (
    <group
      ref={meshRef}
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
      <Text color="white" fontSize={0.8} position={[0, 0, 0.6]} rotation={[0, 0, 0]}>
        !
      </Text>
    </group>
  );
}

function EventNode({ event, position }) {
  const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG['Default'];
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshStandardMaterial color={config.color} emissive={config.color} emissiveIntensity={1.5} />
    </mesh>
  );
}

function SynapticLinks({ selectedLog, events }) {
  if (!selectedLog || !selectedLog.position || !selectedLog.log || events.length === 0) return null;
  const links = useMemo(() => {
    const startPoint = new THREE.Vector3(...selectedLog.position);
    return events.map((event, index) => {
      const angle = (Math.PI / 2) + (index - (events.length - 1) / 2) * 0.5;
      const endPoint = new THREE.Vector3(
        startPoint.x + Math.cos(angle) * 3,
        startPoint.y + Math.sin(angle) * 3,
        startPoint.z
      );
      const midPoint = new THREE.Vector3(
        (startPoint.x + endPoint.x) / 2,
        (startPoint.y + endPoint.y) / 2 + 0.8,
        startPoint.z
      );
      return { event, startPoint, midPoint, endPoint, key: `${event.event_time}-${index}` };
    });
  }, [selectedLog, events]);

  return (
    <group>
      {links.map(({ event, startPoint, midPoint, endPoint, key }) => (
        <group key={key}>
          <EventNode event={event} position={endPoint} />
          <QuadraticBezierLine
            start={startPoint}
            end={endPoint}
            mid={midPoint}
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
  const meshRef = useRef();
  useHoverCursor(isHovered);

  const dynamicColor = useMemo(() => {
    const avgScore = ((log.clarity_score || 0) + (log.immune_score || 0) + (log.physical_readiness_score || 0)) / 30;
    return new THREE.Color().lerpColors(new THREE.Color(0xff4d4d), new THREE.Color(0x00f0ff), avgScore);
  }, [log]);

  useFrame(() => {
    if (!meshRef.current) return;
    const target = isSelected ? 1.8 : (isHovered ? 1.3 : 1);
    const s = THREE.MathUtils.lerp(meshRef.current.scale.x, target, 0.1);
    meshRef.current.scale.setScalar(s);
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); setSelectedItem({ log, position }); }}
      onPointerOver={(e) => { e.stopPropagation(); setHoveredLog(log); }}
      onPointerOut={() => setHoveredLog(null)}
    >
      <sphereGeometry args={[0.2, 32, 32]} />
      <meshStandardMaterial
        color={dynamicColor}
        metalness={0.95}
        roughness={0.1}
        emissive={dynamicColor}
        emissiveIntensity={isSelected || isHovered ? 0.5 : 0}
      />
    </mesh>
  );
}

function Constellation({ logs, setSelectedItem, selectedItem, setHoveredLog, hoveredLog }) {
  return useMemo(() => {
    const radius = 6;
    return logs.map((log, index) => {
      const angle = (index / logs.length) * Math.PI * 2;
      const position = [radius * Math.cos(angle), radius * Math.sin(angle), 0];
      return (
        <LogNode
          key={log.created_at}
          log={log}
          position={position}
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
          <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={hovered ? 2 : 1} roughness={0.2} metalness={0.8} />
        </mesh>
        <Text color="white" fontSize={0.2} position={[0, 0, 0]}>+ LOG</Text>
      </group>
    </Float>
  );
}

// ---------- MAIN ----------
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

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setIsLoading(false); return; }
      const authHeader = { Authorization: `Bearer ${session.access_token}` };

      const logsPromise = supabase
        .from('daily_logs')
        .select('id, created_at, clarity_score, immune_score, physical_readiness_score, tags, ai_notes')
        .order('created_at', { ascending: false })
        .limit(30);

      const nudgesPromise = supabase
        .from('nudges')
        .select('*')
        .eq('is_acknowledged', false);

      const stepsPromise = fetch('/.netlify/functions/fetch-health-data', { headers: authHeader })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      // Try Classic's dashboard first (parity), then fall back to generate-guidance (POST)
      const classicPromise = fetch('/.netlify/functions/get-dashboard-data', { headers: authHeader })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const [logRes, nudgeRes, stepRes, classicJson] = await Promise.all([
        logsPromise, nudgesPromise, stepsPromise, classicPromise
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

      if (stepRes && stepRes.steps) setStepCount(stepRes.steps);

      // Normalize any classic response
      let guide = normalizeGuidance(classicJson?.lightcoreGuide) ||
                  normalizeGuidance(classicJson?.guidance) ||
                  normalizeGuidance(classicJson?.guide);

      // Fallback to generate-guidance if needed
      if (!guide) {
        const gj = await fetch('/.netlify/functions/generate-guidance', {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'neural-cortex' }),
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

        guide = normalizeGuidance(gj);
      }

      if (guide) setGuideData(guide);
    } finally {
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

    const { data: authListener } = supabase.auth.onAuthStateChange(() => { fetchAllData(); });

    return () => {
      supabase.removeChannel(channel);
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (selectedItem && selectedItem.log) {
      const fetchEventsForDay = async () => {
        const { data, error } = await supabase
          .from('events')
          .select('event_type, event_time')
          .eq('log_id', selectedItem.log.id);
        if (error) console.error('Error fetching events:', error);
        else setDayEvents(data || []);
      };
      fetchEventsForDay();
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

  const handleLogSubmitted = () => { setIsLogModalOpen(false); };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      <Hud item={selectedItem || (guideData ? null : null)} onClose={() => setSelectedItem(null)} />

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
            <Locus onLocusClick={() => guideData && setSelectedItem(guideData)} />
            <Constellation
              logs={logHistory}
              setSelectedItem={setSelectedItem}
              selectedItem={selectedItem}
              setHoveredLog={setHoveredLog}
              hoveredLog={hoveredLog}
            />
            <SynapticLinks selectedLog={selectedItem} events={dayEvents} />
            {activeNudges.map((nudge, index) => (
              <AnomalyGlyph key={nudge.id} nudge={nudge} position={[-8, 4 - index * 2, -5]} onGlyphClick={setSelectedItem} />
            ))}
            <LogEntryButton onClick={() => setIsLogModalOpen(true)} />
          </>
        )}

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          autoRotate={autoRotate}
          autoRotateSpeed={0.3}
          onStart={() => { setAutoRotate(false); clearTimeout(idleRef.current); }}
          onEnd={() => { clearTimeout(idleRef.current); idleRef.current = setTimeout(() => setAutoRotate(true), 4000); }}
        />

        <EffectComposer multisampling={0}>
          <FXAA />
          <Bloom intensity={1.0} luminanceThreshold={0.45} luminanceSmoothing={0.8} />
        </EffectComposer>
      </Canvas>

      {/* When a guide exists but nothing is selected, show it by default */}
      {!selectedItem && guideData && <Hud item={guideData} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}

export default NeuralCortex;
