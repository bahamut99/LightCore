import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

function Trends() {
  const [range, setRange] = useState(7);
  const [chartData, setChartData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const clarityChartRef = useRef(null);
  const immuneChartRef = useRef(null);
  const physicalChartRef = useRef(null);
  const chartInstances = useRef({});

  const fetchChartData = useCallback(async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setIsLoading(false); return; }
    
    try {
      const response = await fetch(`/.netlify/functions/get-chart-data?range=${range}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await response.json();
      setChartData(data);
    } catch (error) { console.error("Error fetching chart data:", error); } 
    finally { setIsLoading(false); }
  }, [range]);

  useEffect(() => {
    fetchChartData();
    window.addEventListener('newLogSubmitted', fetchChartData);
    return () => window.removeEventListener('newLogSubmitted', fetchChartData);
  }, [fetchChartData]);

  useEffect(() => {
    const cleanup = () => {
        Object.values(chartInstances.current).forEach(chart => chart?.destroy());
    };
    cleanup();

    if (chartData && clarityChartRef.current && immuneChartRef.current && physicalChartRef.current) {
        const commonOptions = {
            scales: { 
                y: { beginAtZero: true, max: 10, ticks: { color: '#9CA3AF', stepSize: 2 } },
                x: { type: 'time', time: { unit: 'day' }, grid: { display: false }, ticks: { color: '#9CA3AF' } } 
            },
            maintainAspectRatio: false,
        };
        chartInstances.current.clarity = renderChart(clarityChartRef.current, 'Mental Clarity', chartData.labels, chartData.clarityData, '#38bdf8', commonOptions);
        chartInstances.current.immune = renderChart(immuneChartRef.current, 'Immune Risk', chartData.labels, chartData.immuneData, '#facc15', commonOptions);
        chartInstances.current.physical = renderChart(physicalChartRef.current, 'Physical Output', chartData.labels, chartData.physicalData, '#4ade80', commonOptions);
    }
    return cleanup;
  }, [chartData]);

  function renderChart(canvas, label, labels, data, hexColor, options) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    const r = parseInt(hexColor.slice(1, 3), 16), g = parseInt(hexColor.slice(3, 5), 16), b = parseInt(hexColor.slice(5, 7), 16);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.4)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    return new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label, data, backgroundColor: gradient, borderColor: hexColor, borderWidth: 2, pointRadius: 3, pointBackgroundColor: hexColor, fill: true, tension: 0.4 }] },
        options: { ...options, plugins: { legend: { display: false }, datalabels: { display: false }, title: { display: true, text: label, color: '#9CA3AF', font: { size: 16 } } } }
    });
  }

  return (
    <div className="card">
        <h2>📊 Trends</h2>
        <div className="toggle-buttons">
            <button onClick={() => setRange(7)} className={range === 7 ? 'active' : ''}>7 Day</button>
            <button onClick={() => setRange(30)} className={range === 30 ? 'active' : ''}>30 Day</button>
        </div>
        {isLoading ? <div className="loader" style={{margin: '1rem auto'}}></div> : (
            <>
                <div className="chart-container"><canvas ref={clarityChartRef}></canvas></div>
                <div className="chart-container"><canvas ref={immuneChartRef}></canvas></div>
                <div className="chart-container"><canvas ref={physicalChartRef}></canvas></div>
            </>
        )}
    </div>
  );
}

export default Trends;