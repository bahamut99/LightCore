import React from 'react';
import ReactDOM from 'react-dom/client';
import Goals from './components/Goals.jsx';
import './style.css'; // We can reuse the main stylesheet

// Create a new stylesheet link for the goals-specific styles
const goalsStyleSheet = document.createElement('link');
goalsStyleSheet.rel = 'stylesheet';
goalsStyleSheet.href = '/goals.css'; // Path to the new CSS file
document.head.appendChild(goalsStyleSheet);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Goals />
  </React.StrictMode>
);