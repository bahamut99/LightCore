import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { supabase } from '../supabaseClient';
import * as THREE from 'three';

// The Locus orb is now simpler. Its job is to be a beautiful, reflective surface.
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
      {/* This new material is like polished chrome, perfect for reflecting colored light */}
      <meshStandardMaterial 
        color="#f0f0f0" // A neutral, bright base color
        metalness={0.9}   // Highly metallic
        roughness={0.05}  // Very smooth and reflective
      />
    </mesh>
  );
}

// The main component now fetches data and controls the lighting
function NeuralCortex() {
  const [latestScores, setLatestScores] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLatestData = async () => {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const { data: logs, error } = await supabase
          .from('daily_logs')
          .select('clarity_score, immune_score, physical_readiness_score')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.error("Error fetching latest log:", error);
        } else if (logs && logs.length > 0) {
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

    fetchLatestData();
  }, []);

  // Calculate light intensities based on scores
  const lightIntensities = useMemo(() => {
    if (!latestScores) return { clarity: 0, immune: 0, physical: 0 };
    // We multiply the 1-10 score to get a brighter, more impactful intensity
    return {
      clarity: latestScores.clarity * 150,
      immune: latestScores.immune * 150,
      physical: latestScores.physical * 150,
    };
  }, [latestScores]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      <Canvas camera={{ position: [0, 0, 12], fov: 75 }}>
        {/* A soft ambient light to ensure the orb is never fully black */}
        <ambientLight intensity={0.2} />

        {/* --- TRI-METRIC LIGHTING --- */}
        {/* Each point light is positioned differently and has a unique color. */}
        {/* Its intensity is now directly tied to a specific health score. */}
        
        <pointLight 
          position={[-10, 5, 5]} 
          intensity={lightIntensities.clarity} 
          color="#00f0ff" // Cyan for Clarity
        />
        <pointLight 
          position={[10, 5, 5]} 
          intensity={lightIntensities.immune} 
          color="#ffd700" // Gold for Immune
        />
        <pointLight 
          position={[0, -10, 5]} 
          intensity={lightIntensities.physical} 
          color="#00ff88" // Green for Physical
        />
        
        {!isLoading && <Locus />}

        <OrbitControls enablePan={false} enableZoom={true} autoRotate={true} autoRotateSpeed={0.3}/>
      </Canvas>
    </div>
  );
}

export default NeuralCortex;