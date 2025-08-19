// src/components/LightcoreMatrix.jsx
// Lightweight canvas background animation with NO external deps.

import React, { useEffect, useRef } from 'react';

export default function LightcoreMatrix({ logCount = 0 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const ctxRef = useRef(null);
  const particlesRef = useRef([]);
  const startedRef = useRef(false);

  // tune density & speed without touching layout
  const GRID = 60;              // number of points across the short edge
  const SPEED = 0.35;           // base animation speed
  const GLOW = 0.6;             // glow strength (0..1)

  const init = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpi = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpi);
    canvas.height = Math.floor(h * dpi);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;

    // build a grid of points that softly pulse
    const short = Math.min(w, h);
    const step = short / GRID;
    const cols = Math.ceil(w / step);
    const rows = Math.ceil(h / step);

    const particles = [];
    let i = 0;
    for (let y = 0; y <= rows; y++) {
      for (let x = 0; x <= cols; x++) {
        const px = x * step * dpi;
        const py = y * step * dpi;
        // give each point a phase so they don't sync
        const phase = Math.random() * Math.PI * 2;
        particles[i++] = { x: px, y: py, phase };
      }
    }
    particlesRef.current = particles;
  };

  const draw = (t) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const canvas = canvasRef.current;
    const { width, height } = canvas;

    // fade previous frame (motion trail)
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(10, 10, 26, 0.22)';
    ctx.fillRect(0, 0, width, height);

    // base color + glow
    const cyan = 'rgba(0, 240, 255, 1)';
    ctx.shadowColor = 'rgba(0, 240, 255, 1)';
    ctx.shadowBlur = 6 * GLOW;

    // small influence from logCount so it livens up when the user logs
    const activityBoost = Math.min(1.5, 1 + (logCount || 0) * 0.02);
    const speed = SPEED * activityBoost;

    // draw points
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particlesRef.current) {
      // subtle pulsing alpha
      const a = 0.08 + 0.06 * Math.sin(p.phase + t * 0.0015 * speed);
      const r = 1.4 + 0.6 * Math.sin(p.phase * 1.7 + t * 0.002 * speed);

      ctx.beginPath();
      ctx.fillStyle = cyan.replace(', 1)', `, ${a})`);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  useEffect(() => {
    const handle = () => {
      init();
      // kick off loop once
      if (!startedRef.current) {
        startedRef.current = true;
        const loop = (ts) => {
          draw(ts);
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    handle();
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('resize', handle);
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,           // stays behind your UI
        pointerEvents: 'none',
        background: '#0a0a1a',
      }}
    />
  );
}
