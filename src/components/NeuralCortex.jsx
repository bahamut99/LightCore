import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

// This component will be our central "Locus" orb
function Locus() {
  // useRef is a React hook to get a direct reference to the 3D object
  const meshRef = useRef();

  // useFrame is a hook from React Three Fiber that runs on every single frame
  useFrame((state, delta) => {
    // Gently rotate the orb on every frame
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.1;
      meshRef.current.rotation.x += delta * 0.05;
    }
  });

  return (
    <mesh ref={meshRef}>
      {/* This is the shape of our orb. An Icosahedron is a 20-sided sphere-like shape. */}
      <icosahedronGeometry args={[3, 4]} />
      {/* This is the material, or "skin," of the orb. */}
      <meshStandardMaterial 
        color="#00f0ff"
        emissive="#00f0ff" // Makes the material glow
        emissiveIntensity={0.7}
        metalness={0.8}
        roughness={0.2}
        wireframe={true} // Renders the geometric wireframe for that "2077" look
      />
    </mesh>
  );
}

// This is the main component that holds the entire 3D scene
function NeuralCortex() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      <Canvas camera={{ position: [0, 0, 10], fov: 75 }}>
        {/* --- LIGHTING --- */}
        {/* Ambient light provides a soft, base illumination to the whole scene */}
        <ambientLight intensity={0.5} />
        {/* Point light acts like a lightbulb, casting light from a single point */}
        <pointLight position={[15, 15, 15]} intensity={1000} color="#00f0ff" />
        
        {/* --- OBJECTS --- */}
        <Locus />

        {/* --- CONTROLS --- */}
        {/* This gives you mouse controls to zoom, pan, and rotate the scene */}
        <OrbitControls enablePan={false} enableZoom={true} autoRotate={true} autoRotateSpeed={0.3}/>
      </Canvas>
    </div>
  );
}

export default NeuralCortex;