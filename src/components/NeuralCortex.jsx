import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { supabase } from '../supabaseClient';
import * as THREE from 'three';

const EVENT_CONFIG = { 'Workout': { color: '#4ade80' }, 'Meal': { color: '#facc15' }, 'Caffeine': { color: '#f97316' }, 'Default': { color: '#a78bfa' } };

// --- UI COMPONENTS ---

function Hud({ item, onClose }) {
  if (!item) return null;

  const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const isLog = 'ai_notes' in item;

  return (
    <>
      <style>{`.hud-scroll::-webkit-scrollbar { display: none; } .hud-scroll { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
      <div style={{ position: 'absolute', top: '2rem', left: '2rem', width: '400px', color: '#00f0ff', background: 'rgba(10, 25, 47, 0.7)', border: '1px solid rgba(0, 240, 255, 0.2)', backdropFilter: 'blur(10px)', borderRadius: '0.5rem', padding: '1.5rem', fontFamily: "'Roboto Mono', monospace", fontSize: '14px', animation: 'fadeIn 0.5s ease-out', zIndex: 10 }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'none', border: 'none', color: '#00f0ff', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
        <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '1.25rem', textShadow: '0 0 5px #00f0ff', marginBottom: '1rem' }}>
          {isLog ? `LOG ENTRY: ${formatDate(item.created_at)}` : item.headline.toUpperCase()}
        </h2>
        <div className="hud-scroll" style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '1rem', marginBottom: '1rem' }}>
          <p style={{ color: 'white', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{isLog ? item.ai_notes : item.body_text}</p>
        </div>
        <div style={{ borderTop: '1px solid rgba(0, 240, 255, 0.2)', paddingTop: '1rem' }}>
          <h3 style={{ fontFamily: "'Orbitron', sans-serif", marginBottom: '0.75rem' }}>{isLog ? 'TAGS' : 'SUGGESTED ACTIONS'}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {isLog ? item.tags?.map(tag => <span key={tag} style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '99px', fontSize: '12px' }}>{tag}</span>)
             : item.suggested_actions?.map(action => <span key={action} style={{ background: 'rgba(255, 77, 77, 0.2)', padding: '0.25rem 0.75rem', borderRadius: '99px', fontSize: '12px' }}>{action}</span>)}
          </div>
        </div>
      </div>
    </>
  );
}

// --- 3D COMPONENTS ---

function Locus() {
  const meshRef = useRef();
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.1;
      meshRef.current.rotation.x += delta * 0.05;
    }
  });
  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[3, 5]} />
      <meshStandardMaterial color="#f0f0f0" metalness={0.9} roughness={0.05} />
    </mesh>
  );
}

function AnomalyGlyph({ nudge, position, onGlyphClick }) {
  const meshRef = useRef();
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
      const time = state.clock.getElapsedTime();
      meshRef.current.position.y = position[1] + Math.sin(time) * 0.2;
    }
  });

  return (
    <group ref={meshRef} position={position} onClick={() => onGlyphClick(nudge)}>
      <mesh>
        <octahedronGeometry args={[0.5]} />
        <meshStandardMaterial color="#ff4d4d" emissive="#ff4d4d" emissiveIntensity={1} roughness={0.2} metalness={0.8} />
      </mesh>
      <Text color="white" fontSize={0.8} position={[0, 0, 0.6]} rotation={[0, 0, 0]}>!</Text>
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
  if (!selectedLog || !selectedLog.position || events.length === 0) return null;

  const links = useMemo(() => {
    const startPoint = new THREE.Vector3(...selectedLog.position);
    return events.map((event, index) => {
      const angle = (Math.PI / 2) + (index - (events.length - 1) / 2) * 0.5;
      const endPoint = new THREE.Vector3(startPoint.x + Math.cos(angle) * 3, startPoint.y + Math.sin(angle) * 3, startPoint.z);
      return { event, startPoint, endPoint };
    });
  }, [selectedLog, events]);

  return (
    <group>
      {links.map(({ event, startPoint, endPoint }) => (
        <group key={event.event_time}>
          <EventNode event={event} position={endPoint} />
          <Line points={[startPoint, endPoint]} color="#00f0ff" lineWidth={1} transparent opacity={0.5} />
        </group>
      ))}
    </group>
  );
}

function LogNode({ log, position, setSelectedLog, isSelected, setHoveredLog, isHovered }) {
  const meshRef = useRef();
  const dynamicColor = useMemo(() => {
    const avgScore = ((log.clarity_score || 0) + (log.immune_score || 0) + (log.physical_readiness_score || 0)) / 30;
    return new THREE.Color().lerpColors(new THREE.Color(0xff4d4d), new THREE.Color(0x00f0ff), avgScore);
  }, [log]);

  useEffect(() => {
    document.body.style.cursor = isHovered ? 'pointer' : 'auto';
    return () => { document.body.style.cursor = 'auto' };
  }, [isHovered]);

  useFrame(() => {
    const targetScale = isSelected ? 1.8 : (isHovered ? 1.3 : 1);
    meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1).multiplyScalar(targetScale), 0.1);
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); setSelectedLog({ log, position }); }}
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

function Constellation({ logs, setSelectedLog, selectedLog, setHoveredLog, hoveredLog }) {
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
          setSelectedLog={setSelectedLog}
          isSelected={selectedLog?.log?.created_at === log.created_at}
          setHoveredLog={setHoveredLog}
          isHovered={hoveredLog?.created_at === log.created_at}
        />
      );
    });
  }, [logs, setSelectedLog, selectedLog, setHoveredLog, hoveredLog]);
}

// --- MAIN COMPONENT ---
function NeuralCortex() {
  const [logHistory, setLogHistory] = useState([]); 
  const [latestScores, setLatestScores] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [hoveredLog, setHoveredLog] = useState(null);
  const [dayEvents, setDayEvents] = useState([]);
  const [activeNudges, setActiveNudges] = useState([]);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const [logRes, nudgeRes] = await Promise.all([
          supabase.from('daily_logs').select('id, created_at, clarity_score, immune_score, physical_readiness_score, tags, ai_notes').order('created_at', { ascending: false }).limit(30),
          supabase.from('nudges').select('*').eq('is_acknowledged', false)
        ]);
        
        const { data: logs, error: logError } = logRes;
        if (logError) console.error("Error fetching logs:", logError);
        else if (logs && logs.length > 0) {
          setLogHistory(logs);
          setLatestScores({ ...logs[0] });
        } else {
          setLatestScores({ clarity: 8, immune: 8, physical: 8 });
        }

        const { data: nudges, error: nudgeError } = nudgeRes;
        if (nudgeError) console.error("Error fetching nudges:", nudgeError);
        else setActiveNudges(nudges || []);
      }
      setIsLoading(false);
    };
    fetchAllData();
  }, []);

  useEffect(() => {
    if (selectedItem && selectedItem.log) {
      const fetchEventsForDay = async () => {
        const { data, error } = await supabase.from('events').select('event_type, event_time').eq('log_id', selectedItem.log.id);
        if (error) console.error("Error fetching events:", error);
        else setDayEvents(data || []);
      };
      fetchEventsForDay();
    } else {
      setDayEvents([]); 
    }
  }, [selectedItem]);

  const lightIntensities = useMemo(() => {
    if (!latestScores) return { clarity: 0, immune: 0, physical: 0 };
    return {
      clarity: (latestScores.clarity_score || 0) * 150,
      immune: (latestScores.immune_score || 0) * 150,
      physical: (latestScores.physical_readiness_score || 0) * 150,
    };
  }, [latestScores]);

  const handleSelectItem = (item) => {
    const isLog = 'log' in item && 'position' in item;
    if (isLog) {
      setSelectedItem(item);
    } else {
      setSelectedItem(item);
    }
  };
  
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      <Hud item={selectedItem?.log || selectedItem} onClose={() => setSelectedItem(null)} />
      
      <Canvas camera={{ position: [0, 0, 12], fov: 75 }}>
        <ambientLight intensity={0.2} />
        <pointLight position={[-10, 5, 5]} intensity={lightIntensities.clarity} color="#00f0ff" />
        <pointLight position={[10, 5, 5]} intensity={lightIntensities.immune} color="#ffd700" />
        <pointLight position={[0, -10, 5]} intensity={lightIntensities.physical} color="#00ff88" />
        
        {!isLoading && (
          <>
            <Locus />
            <Constellation logs={logHistory} setSelectedLog={handleSelectItem} selectedLog={selectedItem} setHoveredLog={setHoveredLog} hoveredLog={hoveredLog}/>
            <SynapticLinks selectedLog={selectedItem} events={dayEvents} />
            {activeNudges.map((nudge, index) => (
              <AnomalyGlyph key={nudge.id} nudge={nudge} position={[-8, 4 - index * 2, -5]} onGlyphClick={setSelectedItem} />
            ))}
          </>
        )}

        <OrbitControls 
          enablePan={false} 
          enableZoom={true} 
          autoRotate={autoRotate} 
          autoRotateSpeed={0.3}
          onStart={() => setAutoRotate(false)}
        />
        
        <EffectComposer>
          <Bloom 
            intensity={1.2}
            luminanceThreshold={0.4}
            luminanceSmoothing={0.9}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

export default NeuralCortex;