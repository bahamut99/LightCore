import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './style.css';

// Charts
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
Chart.register(ChartDataLabels);

// Bundle-time include (runs early, safe to keep)
import './route-by-preference.js';

// Tiny error boundary so we never show a blank page
class AppBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError: false, err: null }; }
  static getDerivedStateFromError(err){ return { hasError: true, err }; }
  componentDidCatch(err, info){ console.error('App crashed:', err, info); }
  render(){
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#fff', background:'#111827', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
          <p style={{ opacity: .8 }}>Open the browser console for details. The app kept running instead of going blank.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </React.StrictMode>
);
