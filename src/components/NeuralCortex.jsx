import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { supabase } from '../supabaseClient';
import * as THREE from 'three';

// NEW: A component for each individual historical log node
function LogNode({ log, position }) {
  const meshRef = useRef();

  // Calculate the color based on this specific log's average score
  const materialProps = useMemo(() => {
    const avgScore = (log.clarity_score + log.immune_score + log.physical_readiness_score) / 30;
    const color = new THREE.Color().lerpColors(new THREE.Color(0xff4d4d), new THREE.Color(0x00f0ff), avgScore);
    return { color, emissive: color };
  }, [log]);

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.2, 16, 16]} />
      <meshStandardMaterial {...materialProps} emissiveIntensity={1} />
    </mesh>
  );
}

// NEW: A component to arrange all the log nodes into a constellation
function Constellation({ logs }) {
  const nodes = useMemo(() => {
    // We'll arrange the nodes in a circle around the Locus
    const radius = 6;
    return logs.map((log, index) => {
      const angle = (index / logs.length) * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      const z = 0; // All on the same plane for now
      return <LogNode key={log.created_at} log={log} position={[x, y, z]} />;
    });
  }, [logs]);

  return <group>{nodes}</group>;
}

// The Locus orb remains the same
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

// The main component now fetches the full history
function NeuralCortex() {
  const [logHistory, setLogHistory] = useState([]); // Stores all 30 logs
  const [latestScores, setLatestScores] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Fetch the last 30 logs instead of just one
        const { data: logs, error } = await supabase
          .from('daily_logs')
          .select('created_at, clarity_score, immune_score, physical_readiness_score')
          .order('created_at', { ascending: false })
          .limit(30);

        if (error) {
          console.error("Error fetching logs:", error);
        } else if (logs && logs.length > 0) {
          setLogHistory(logs); // Store the entire history
          // The "latest" scores are still from the first item in the sorted array
          setLatestScores({
            clarity: logs[0].clarity_score,
            immune: logs[0].immune_score,
            physical: logs[0].physical_readiness_score
          });
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
      clarity: latestScores.clarity * 150,
      immune: latestScores.immune * 150,
      physical: latestScores.physical * 150,
    };
  }, [latestScores]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      <Canvas camera={{ position: [0, 0, 12], fov: 75 }}>
        <ambientLight intensity={0.2} />
        <pointLight position={[-10, 5, 5]} intensity={lightIntensities.clarity} color="#00f0ff" />
        <pointLight position={[10, 5, 5]} intensity={lightIntensities.immune} color="#ffd700" />
        <pointLight position={[0, -10, 5]} intensity={lightIntensities.physical} color="#00ff88" />
        
        {!isLoading && (
          <>
            <Locus />
            <Constellation logs={logHistory} />
          </>
        )}

        <OrbitControls enablePan={false} enableZoom={true} autoRotate={true} autoRotateSpeed={0.3}/>
      </Canvas>
    </div>
  );
}

export default NeuralCortex;