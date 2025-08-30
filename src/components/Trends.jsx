import React, { useEffect, useRef, useState, useCallback } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { supabase } from '../supabaseClient.js';

function Trends({ range, setRange }) {
  const chartInstances = useRef({});
  const [trendsData, setTrendsData] = useState(null);
  const [isTrendsLoading, setIsTrendsLoading] = useState(true);

  const fetchChartData = useCallback(async () => {
    setIsTrendsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsTrendsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/.netlify/functions/get-chart-data?range=${range}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch chart data');
      const data = await res.json();
      setTrendsData(data);
    } catch (err) {
      console.error('Error fetching chart data:', err);
      setTrendsData(null);
    } finally {
      setIsTrendsLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchChartData(); }, [fetchChartData]);

  useEffect(() => {
    const canvases = {
      clarity: document.getElementById('clarityChart'),
      immune: document.getElementById('immuneChart'),
      physical: document.getElementById('physicalChart'),
    };

    // Destroy any previous charts
    Object.values(chartInstances.current).forEach(c => c?.destroy());

    if (!trendsData || !canvases.clarity || !canvases.immune || !canvases.physical) return;

    // Build proper {x,y} points so the time scale positions them by timestamp
    const toPoints = (labels, values) =>
      labels.map((ts, i) => ({ x: new Date(ts), y: values[i] }));

    const timeUnit = range === 1 ? 'hour' : 'day';

    // For 1D, lock the axis to 00:00..24:00 of today so 12:01 AM sits at the very start.
    let xMin, xMax;
    if (range === 1) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      xMin = start;
      xMax = end;
    }

    const clarityPts   = toPoints(trendsData.labels, trendsData.clarityData);
    const immunePts    = toPoints(trendsData.labels, trendsData.immuneData);
    const physicalPts  = toPoints(trendsData.labels, trendsData.physicalData);

    const fmtDate = (ts) =>
      new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const fmtTime = (ts) =>
      new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    const commonOptions = {
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 10,
          ticks: { color: '#9CA3AF', stepSize: 2 },
          grid: { color: 'rgba(148,163,184,0.08)' },
        },
        x: {
          type: 'time',
          time: { unit: timeUnit },
          distribution: 'linear', // space points by actual time
          ticks: { color: '#9CA3AF' },
          grid: { display: false },
          ...(range === 1 ? { min: xMin, max: xMax } : {}),
        },
      },
      elements: { point: { radius: 3, hoverRadius: 5 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            // Title: time for 1D, date for multi-day
            title: (items) => {
              const ts = items?.[0]?.parsed?.x;
              if (!ts && ts !== 0) return '';
              return range === 1 ? fmtTime(ts) : fmtDate(ts);
            },
            // Label: metric + value only
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
          },
        },
        // Ensure data labels plugin never shows tiny numbers (if globally registered elsewhere)
        datalabels: { display: false },
      },
    };

    chartInstances.current.clarity = renderChart(
      canvases.clarity, 'Mental Clarity', clarityPts, '#38bdf8', commonOptions
    );
    chartInstances.current.immune = renderChart(
      canvases.immune, 'Immune Defense', immunePts, '#facc15', commonOptions
    );
    chartInstances.current.physical = renderChart(
      canvases.physical, 'Physical Readiness', physicalPts, '#4ade80', commonOptions
    );

    return () => Object.values(chartInstances.current).forEach(c => c?.destroy());
  }, [trendsData, range]);

  function renderChart(canvas, label, points, hexColor, options) {
    const ctx = canvas.getContext('2d');

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.4)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    return new Chart(ctx, {
      type: 'line',
      data: {
        // no separate labels—points carry their own x value
        datasets: [{
          label,
          data: points, // [{x: Date, y: number}, ...]
          backgroundColor: gradient,
          borderColor: hexColor,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: hexColor,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          datalabels: { display: false },
          parsing: true, // Chart.js will read {x,y}
        }],
      },
      options: {
        ...options,
        plugins: {
          ...options.plugins,
          title: { display: true, text: label, color: '#9CA3AF', font: { size: 16 } },
        },
      },
    });
  }

  const TimeRangeButton = ({ value, label }) => (
    <button onClick={() => setRange(value)} className={range === value ? 'active' : ''}>
      {label}
    </button>
  );

  return (
    <div className="card">
      <h2>Trends</h2>
      <div className="time-range-buttons">
        <TimeRangeButton value={1} label="1D" />
        <TimeRangeButton value={7} label="7D" />
        <TimeRangeButton value={30} label="1M" />
        <TimeRangeButton value={90} label="3M" />
      </div>

      {isTrendsLoading ? (
        <div className="loader" style={{ margin: '8rem auto' }} />
      ) : (
        <>
          <div className="chart-container"><canvas id="clarityChart" /></div>
          <div className="chart-container"><canvas id="immuneChart" /></div>
          <div className="chart-container"><canvas id="physicalChart" /></div>
        </>
      )}
    </div>
  );
}

export default Trends;

