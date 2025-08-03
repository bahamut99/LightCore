import React from 'react';
import ReactDOM from 'react-dom/client';
import Goals from './components/Goals.jsx';
import './style.css'; 

const goalsStyleSheet = document.createElement('link');
goalsStyleSheet.rel = 'stylesheet';
goalsStyleSheet.href = '/goals.css';
document.head.appendChild(goalsStyleSheet);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Goals />
  </React.StrictMode>
);