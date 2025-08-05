import React from 'react';

// This component determines the complexity of the matrix based on log count.
const LightcoreMatrix = ({ logCount }) => {
  let matrixClass = 'matrix-level-0'; // Default state (0 logs)

  if (logCount >= 30) {
    matrixClass = 'matrix-level-4'; // Deep Persona Layer
  } else if (logCount >= 14) {
    matrixClass = 'matrix-level-3'; // Temporal Drift Map
  } else if (logCount >= 7) {
    matrixClass = 'matrix-level-2'; // Pattern Engine
  } else if (logCount >= 1) {
    matrixClass = 'matrix-level-1'; // First Signal
  }

  return (
    <div className={`lightcore-matrix-background ${matrixClass}`}>
      {/* The CSS will handle rendering the nodes and lines based on the class */}
    </div>
  );
};

export default LightcoreMatrix;