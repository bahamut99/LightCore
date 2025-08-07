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
            const response = await fetch(`/.netlify/functions/get-chart-data?range=${range}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (!response.ok) {
                throw new Error("Failed to fetch chart data");
            }
            const data = await response.json();
            setTrendsData(data);
        } catch (error) {
            console.error("Error fetching chart data:", error);
            setTrendsData(null);
        } finally {
            setIsTrendsLoading(false);
        }
    }, [range]);

    useEffect(() => {
        fetchChartData();
    }, [fetchChartData]);
    
    useEffect(() => {
        const canvases = {
            clarity: document.getElementById('clarityChart'),
            immune: document.getElementById('immuneChart'),
            physical: document.getElementById('physicalChart')
        };

        // Destroy previous chart instances
        Object.values(chartInstances.current).forEach(c => c?.destroy());

        if (trendsData && canvases.clarity && canvases.immune && canvases.physical) {
            const timeUnit = range === 1 ? 'hour' : 'day';
            const commonOptions = {
                scales: { 
                    y: { beginAtZero: true, max: 10, ticks: { color: '#9CA3AF', stepSize: 2 } },
                    x: { type: 'time', time: { unit: timeUnit }, grid: { display: false }, ticks: { color: '#9CA3AF' } } 
                },
                maintainAspectRatio: false,
            };
            chartInstances.current.clarity = renderChart(canvases.clarity, 'Mental Clarity', trendsData.labels, trendsData.clarityData, '#38bdf8', commonOptions);
            chartInstances.current.immune = renderChart(canvases.immune, 'Immune Defense', trendsData.labels, trendsData.immuneData, '#facc15', commonOptions);
            chartInstances.current.physical = renderChart(canvases.physical, 'Physical Readiness', trendsData.labels, trendsData.physicalData, '#4ade80', commonOptions);
        }

        return () => Object.values(chartInstances.current).forEach(c => c?.destroy());
    }, [trendsData, range]); // Re-run when trendsData or range changes

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
            options: { ...options, plugins: { legend: { display: false }, title: { display: true, text: label, color: '#9CA3AF', font: { size: 16 } } } }
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
                <TimeRangeButton value={7} label="7D" />
                <TimeRangeButton value={30} label="1M" />
                <TimeRangeButton value={90} label="3M" />
            </div>
            {isTrendsLoading ? <div className="loader" style={{margin: '8rem auto'}}></div> : (
                <>
                    <div className="chart-container"><canvas id="clarityChart"></canvas></div>
                    <div className="chart-container"><canvas id="immuneChart"></canvas></div>
                    <div className="chart-container"><canvas id="physicalChart"></canvas></div>
                </>
            )}
        </div>
    );
}

export default Trends;