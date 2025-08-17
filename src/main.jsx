import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './style.css'
import Chart from 'chart.js/auto'
import ChartDataLabels from 'chartjs-plugin-datalabels'

Chart.register(ChartDataLabels)

// Decide which dashboard to boot with:
// - URL param ?view=neural|classic (set by route-by-preference.js)
// - fallback to localStorage 'lc_view'
// - default to 'neural' (Cortex)
function getInitialView() {
  const params = new URL(window.location.href).searchParams
  const v = params.get('view') || localStorage.getItem('lc_view') || 'neural'
  const normalized = v === 'classic' ? 'classic' : 'neural'
  try { localStorage.setItem('lc_view', normalized) } catch {}
  // Optional global for any legacy code that wants to read it
  window.__LC_INITIAL_VIEW__ = normalized
  return normalized
}

const initialView = getInitialView()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App initialView={initialView} />
  </React.StrictMode>,
)
