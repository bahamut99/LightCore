import React from 'react';
import LogEntry from './LogEntry.jsx';

// This component is a wrapper that displays the LogEntry form in a modal
function LogEntryModal({ isOpen, onClose, onLogSubmitted, stepCount }) {
  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20 // Ensure it's on top of the HUD
      }}
      onClick={onClose} // Close modal if clicking on the background
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '600px',
          // We can reuse the HUD's cool styling for this modal
          color: '#00f0ff',
          background: 'rgba(10, 25, 47, 0.8)',
          border: '1px solid rgba(0, 240, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          borderRadius: '0.5rem',
          animation: 'fadeIn 0.3s ease-out'
        }}
        onClick={e => e.stopPropagation()} // Prevent clicks inside the modal from closing it
      >
        {/* We pass the onLogSubmitted callback down to the LogEntry component */}
        <LogEntry onLogSubmitted={onLogSubmitted} stepCount={stepCount} />
      </div>
    </div>
  );
}

export default LogEntryModal;