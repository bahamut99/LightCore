import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { supabase } from '../supabaseClient';
import * as THREE from 'three';

// UPDATE: Added custom scrollbar hiding styles
function Hud({ log, onClose }) {
  if (!log) return null;

  const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <style>{`
        .hud-scroll::-webkit-scrollbar { display: none; }
        .hud-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div 
        style={{ 
          position: 'absolute', top: '2rem', left: '2rem', width: '400px',
          color: '#00f0ff', background: 'rgba(10, 25, 47, 0.7)',
          border: '1px solid rgba(0, 240, 255, 0.2)', backdropFilter: 'blur(10px)',
          borderRadius: '0.5rem', padding: '1.5rem',
          fontFamily: "'Roboto Mono', monospace", fontSize: '14px',
          animation: 'fadeIn 0.5s ease-out', zIndex: 10
        }}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'none', border: 'none', color: '#00f0ff', fontSize: '1.5rem', cursor: 'pointer' }}>
          &times;
        </button>
        
        <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '1.25rem', textShadow: '0 0 5px #00f0ff', marginBottom: '1rem' }}>
          LOG ENTRY: {formatDate(log.created_at)}
        </h2>
        
        <div className="hud-scroll" style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '1rem', marginBottom: '1rem' }}>
          <p style={{ color: 'white', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{log.ai_notes}</p>
        </div>

        <div style={{ borderTop: '1px solid rgba(0, 240, 255, 0.2)', paddingTop: '1rem' }}>
          <h3 style={{ fontFamily: "'Orbitron', sans-serif", marginBottom: '0.75rem' }}>TAGS</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {log.tags?.map(tag => (
              <span key={tag} style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '99px', fontSize: '12px' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// UPDATE: Now with hover effects and improved material
function LogNode({ log, position, setSelectedLog, isSelected, setHoveredLog, isHovered }) {
  const meshRef = useRef();

  // Change cursor style on hover
  useEffect(() => {
    document.body.style.cursor = isHovered ? 'pointer' : 'auto';
    return () => { document.body.style.cursor = 'auto' }; // Cleanup
  }, [isHovered]);

  // Animate scale based on hover and selection state
  useFrame(() => {
    const targetScale = isSelected ? 1.8 : (isHovered ? 1.3 : 1);
    meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1).multiplyScalar(targetScale), 0.1);
  });

  return (
    <mesh 
      ref={meshRef} 
      position={position}
      onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
      onPointerOver={(e) => { e.stopPropagation(); setHoveredLog(log); }}
      onPointerOut={() => setHoveredLog(null)}
    >
      <sphereGeometry args={[0.2, 32, 32]} />
      {/* UPDATE: New reflective chrome material for a more 3D look */}
      <meshStandardMaterial color="#f0f0f0" metalness={0.95} roughness={0.1} />
    </mesh>
  );
}

// UPDATE: Passes hover state down
function Constellation({ logs, setSelectedLog, selectedLog, setHoveredLog, hoveredLog }) {
  return useMemo(() => {
    const radius = 6;
    return logs.map((log, index) => {
      const angle = (index / logs.length) * Math.PI * 2;
      return (
        <LogNode 
          key={log.created_at} 
          log={log} 
          position={[radius * Math.cos(angle), radius * Math.sin(angle), 0]} 
          setSelectedLog={setSelectedLog}
          isSelected={selectedLog?.created_at === log.created_at}
          setHoveredLog={setHoveredLog}
          isHovered={hoveredLog?.created_at === log.created_at}
        />
      );
    });
  }, [logs, setSelectedLog, selectedLog, setHoveredLog, hoveredLog]);
}

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

// UPDATE: Main component now manages hover state
function NeuralCortex() {
  const [logHistory, setLogHistory] = useState([]); 
  const [latestScores, setLatestScores] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [hoveredLog, setHoveredLog] = useState(null); // NEW state for hovered log

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const { data: logs, error } = await supabase
          .from('daily_logs')
          .select('created_at, clarity_score, immune_score, physical_readiness_score, tags, ai_notes')
          .order('created_at', { ascending: false })
          .limit(30);

        if (error) console.error("Error fetching logs:", error);
        else if (logs && logs.length > 0) {
          setLogHistory(logs);
          setLatestScores({ ...logs[0] });
        } else {
          setLatestScores({ clarity: 8, immune: 8, physical: 8 });
        }
      }
      setIsLoading(false);
    };
    fetchAllData();
  }, []);

  const lightIntensities = useMemo(() => {
    if (!latestScores) return { clarity: 0, immune: 0, physical: 0 };
    return {
      clarity: (latestScores.clarity_score || 0) * 150,
      immune: (latestScores.immune_score || 0) * 150,
      physical: (latestScores.physical_readiness_score || 0) * 150,
    };
  }, [latestScores]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      <Hud log={selectedLog} onClose={() => setSelectedLog(null)} />
      
      <Canvas camera={{ position: [0, 0, 12], fov: 75 }}>
        <ambientLight intensity={0.2} />
        <pointLight position={[-10, 5, 5]} intensity={lightIntensities.clarity} color="#00f0ff" />
        <pointLight position={[10, 5, 5]} intensity={lightIntensities.immune} color="#ffd700" />
        <pointLight position={[0, -10, 5]} intensity={lightIntensities.physical} color="#00ff88" />
        
        {!isLoading && (
          <>
            <Locus />
            <Constellation 
              logs={logHistory} 
              setSelectedLog={setSelectedLog}
              selectedLog={selectedLog}
              setHoveredLog={setHoveredLog}
              hoveredLog={hoveredLog}
            />
          </>
        )}
        <OrbitControls enablePan={false} enableZoom={true} autoRotate={true} autoRotateSpeed={0.3}/>
      </Canvas>
    </div>
  );
}

export default NeuralCortex;