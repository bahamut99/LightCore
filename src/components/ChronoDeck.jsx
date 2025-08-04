import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

function ChronoDeck({ isLoading, data }) {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        if (chartInstance.current) {
            chartInstance.current.destroy();
        }
        if (data && chartRef.current) {
            const ctx = chartRef.current.getContext('2d');
            chartInstance.current = renderChronoDeckChart(ctx, data);
        }
        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [data]);

    function renderChronoDeckChart(ctx, eventData) {
        const eventConfig = {
            'Workout': { color: '#38bdf8', icon: '🏋️' },
            'Meal': { color: '#facc15', icon: '🍽️' },
            'Snack': { color: '#fde047', icon: ' snacking' },
            'Caffeine': { color: '#f97316', icon: '☕' },
            'Sleep': { color: '#a78bfa', icon: '😴' },
            'Nap': { color: '#c4b5fd', icon: '💤' },
            'Meditation': { color: '#818cf8', icon: '🧘' }
        };

        const dayLabels = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toLocaleDateString('en-US', { weekday: 'short' });
        }).reverse();

        const datasets = Object.keys(eventConfig).map(type => ({
            label: type,
            data: [],
            backgroundColor: eventConfig[type].color,
            borderColor: eventConfig[type].color,
            pointRadius: 6,
            pointHoverRadius: 8,
            showLine: false,
            custom: { icon: eventConfig[type].icon }
        }));

        const sortedEvents = [...eventData].sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

        sortedEvents.forEach((event, index) => {
            const eventTime = new Date(event.event_time);
            const dayStr = eventTime.toLocaleDateString('en-US', { weekday: 'short' });
            const hour = eventTime.getHours() + eventTime.getMinutes() / 60;
            
            const dataset = datasets.find(d => d.label === event.event_type);
            if (dataset && dayLabels.includes(dayStr)) {
                dataset.data.push({ x: hour, y: dayStr });
            }
        });

        return new Chart(ctx, {
            type: 'line', // Using line chart as a base for scatter plot
            data: {
                labels: dayLabels,
                datasets: datasets.filter(d => d.data.length > 0)
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 20, left: 10, right: 20 } },
                scales: {
                    x: {
                        min: 0,
                        max: 24,
                        position: 'top',
                        grid: { color: 'rgba(255, 255, 255, 0.08)' },
                        ticks: {
                            color: '#9CA3AF',
                            stepSize: 2,
                            padding: 10,
                            callback: v => {
                                if (v === 0) return '12am';
                                if (v === 12) return '12pm';
                                if (v === 24) return '';
                                return (v > 12) ? (v - 12) + 'pm' : v + 'am';
                            }
                        }
                    },
                    y: {
                        type: 'category',
                        labels: dayLabels,
                        grid: { display: false },
                        ticks: { color: '#9CA3AF', padding: 10 }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: () => null,
                            label: (context) => {
                                const datasetLabel = context.dataset.label;
                                const hourVal = context.parsed.x;
                                const hour = Math.floor(hourVal);
                                const minute = Math.round((hourVal - hour) * 60);
                                const time = new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                return `${datasetLabel} at ${time}`;
                            }
                        }
                    },
                    datalabels: {
                        display: true,
                        align: 'center',
                        color: 'rgba(0,0,0,0.7)',
                        font: { size: 12 },
                        formatter: (value, context) => {
                           return context.chart.data.datasets[context.datasetIndex].custom.icon;
                        }
                    }
                }
            }
        });
    }

    return (
        <div className="card" id="chronodeck-card">
            <div className="card-header">
                <h2>🕰️ ChronoDeck</h2>
                <button className="expand-btn" title="Expand View (Coming Soon)">⛶</button>
            </div>
            <div className="chart-container" style={{ height: '300px' }}>
                {isLoading ? <div className="loader" style={{ margin: '1rem auto' }}></div> : <canvas ref={chartRef}></canvas>}
            </div>
        </div>
    );
}

export default ChronoDeck;