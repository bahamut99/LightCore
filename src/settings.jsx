import React from 'react';
import ReactDOM from 'react-dom/client';
import Settings from './components/Settings.jsx';
import './style.css'; 

// This is a separate CSS file we can create later for any page-specific styles if needed.
const settingsStyleSheet = document.createElement('link');
settingsStyleSheet.rel = 'stylesheet';
settingsStyleSheet.href = '/goals.css'; // We can reuse the simple layout from goals.css
document.head.appendChild(settingsStyleSheet);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>
);