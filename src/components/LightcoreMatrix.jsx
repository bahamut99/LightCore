import React, { useEffect, useRef } from 'react';

const LightcoreMatrix = ({ logCount }) => {
  const matrixRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (matrixRef.current) {
        const { clientX, clientY } = event;
        const { innerWidth, innerHeight } = window;
        // Normalize coordinates from -0.5 to 0.5 for subtle parallax effect
        const mouseX = (clientX / innerWidth) - 0.5;
        const mouseY = (clientY / innerHeight) - 0.5;
        
        matrixRef.current.style.setProperty('--mouse-x', mouseX);
        matrixRef.current.style.setProperty('--mouse-y', mouseY);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Determine the current visual level based on the total number of logs
  let matrixClass = 'matrix-level-0';
  if (logCount >= 30) {
    matrixClass = 'matrix-level-4';
  } else if (logCount >= 14) {
    matrixClass = 'matrix-level-3';
  } else if (logCount >= 7) {
    matrixClass = 'matrix-level-2';
  } else if (logCount >= 1) {
    matrixClass = 'matrix-level-1';
  }

  return (
    <div ref={matrixRef} className={`lightcore-matrix-background ${matrixClass}`}>
      {/* The CSS handles all the new organic visuals, keeping the component clean */}
    </div>
  );
};

export default LightcoreMatrix;