import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

function ChronoDeck({ isLoading, data }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (chartInstance.current) chartInstance.current.destroy();
    if (data && chartRef.current) {
        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = renderChronoDeckChart(ctx, data);
    }
    return () => chartInstance.current?.destroy();
  }, [data]);

  function renderChronoDeckChart(ctx, data) {
    const eventConfig = { 'Workout':  { color: 'rgba(56, 189, 248, 0.85)'}, 'Meal': { color: 'rgba(250, 204, 21, 0.85)'}, 'Caffeine': { color: 'rgba(249, 115, 22, 0.85)'}, 'Sleep': { color: 'rgba(167, 139, 250, 0.85)'}, 'Nap': { color: 'rgba(196, 181, 253, 0.85)'}};
    const dayLabels = Array.from({length: 7}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toLocaleDateString('en-US', { weekday: 'short' }); }).reverse();
    const processedEvents = [];
    const tempEvents = [...data].sort((a,b) => new Date(a.event_time) - new Date(b.event_time));
    for (let i = 0; i < tempEvents.length; i++) {
        if (i + 1 < tempEvents.length && tempEvents[i].event_type === tempEvents[i+1].event_type) {
            processedEvents.push({ type: tempEvents[i].event_type, start: new Date(tempEvents[i].event_time), end: new Date(tempEvents[i+1].event_time) });
            i++; 
        } else {
            const start = new Date(tempEvents[i].event_time);
            processedEvents.push({ type: tempEvents[i].event_type, start, end: new Date(start.getTime() + 30 * 60 * 1000) });
        }
    }
    const datasets = Object.keys(eventConfig).map(type => ({
        label: type, data: [], backgroundColor: eventConfig[type].color, barPercentage: 0.6,
        borderRadius: 10, borderWidth: 0, custom: { icon: { 'Workout': '🏋️', 'Meal': '🍽️', 'Caffeine': '☕', 'Sleep': '😴', 'Nap': '💤' }[type] }
    }));
    processedEvents.forEach(event => {
        const dayStr = event.start.toLocaleDateString('en-US', { weekday: 'short' });
        const startHour = event.start.getHours() + event.start.getMinutes() / 60;
        const endHour = event.end.getHours() + event.end.getMinutes() / 60 + (event.end.getDate() - event.start.getDate()) * 24;
        const dataset = datasets.find(d => d.label === event.type);
        if (dataset && dayLabels.includes(dayStr)) dataset.data.push({ x: [startHour, endHour], y: dayStr });
    });
    return new Chart(ctx, {
        type: 'bar', data: { labels: dayLabels, datasets: datasets.filter(d => d.data.length > 0) },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } },
            scales: {
                x: { min: 0, max: 24, position: 'top', grid: { color: 'rgba(255, 255, 255, 0.08)' },
                    ticks: { color: '#9CA3AF', stepSize: 2, padding: 10,
                        callback: v => { if (v === 0) return '12am'; if (v === 12) return '12pm'; if (v === 24) return ''; return (v > 12) ? (v - 12) + 'pm' : v + 'am'; }
                    }
                },
                y: { stacked: true, grid: { display: false }, ticks: { color: '#9CA3AF', padding: 10 } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { title: () => null, label: c => `${c.dataset.label}: ${new Date(2000, 0, 1, Math.floor(c.raw.x[0] % 24), Math.round((c.raw.x[0] - Math.floor(c.raw.x[0])) * 60)).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})} - ${new Date(2000, 0, 1, Math.floor(c.raw.x[1] % 24), Math.round((c.raw.x[1] - Math.floor(c.raw.x[1])) * 60)).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}` } },
                datalabels: { color: '#fff', font: { size: 14 }, formatter: (v, c) => (v.x[1] - v.x[0] > 0.5) ? c.dataset.custom.icon : '' }
            }
        }
    });
  }

  return (
    <div className="card" id="chronodeck-card">
      <h2>🕰️ ChronoDeck</h2>
      <div className="chart-container" style={{ height: '300px' }}>
        {isLoading ? <div className="loader" style={{margin: '1rem auto'}}></div> : <canvas ref={chartRef}></canvas>}
      </div>
    </div>
  );
}

export default ChronoDeck;