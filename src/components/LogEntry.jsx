import React, { useState } from 'react';
import { supabase } from '../supabaseClient.js';

async function fetchWithRetry(url, options, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if ([502, 503, 504].includes(response.status)) {
                console.warn(`Attempt ${i + 1}: Server error ${response.status}. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            return response;
        } catch (error) {
            console.warn(`Attempt ${i + 1}: Network error. Retrying...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error(`Failed to fetch after ${retries} attempts.`);
}

function LogEntry() {
    const [log, setLog] = useState('');
    const [sleepHours, setSleepHours] = useState('');
    const [sleepQuality, setSleepQuality] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!log.trim()) { alert("Please enter a log entry."); return; }

        setLoading(true);
        setResults(null);
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("You must be logged in.");

            const response = await fetchWithRetry('/.netlify/functions/analyze-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`},
                body: JSON.stringify({ 
                    log,
                    sleep_hours: sleepHours ? parseFloat(sleepHours) : null,
                    sleep_quality: sleepQuality ? parseInt(sleepQuality, 10) : null
                })
            });

            if (!response.ok) { const d = await response.json(); throw new Error(d.error || `HTTP error! status: ${response.status}`); }

            const newLog = await response.json();
            setResults(newLog);
            setLog('');
            setSleepHours('');
            setSleepQuality('');

            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            fetch('/.netlify/functions/parse-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ log_id: newLog.id, log_text: newLog.log, userTimezone })
            }).then(() => {
                window.dispatchEvent(new CustomEvent('newLogSubmitted'));
            });

        } catch (err) { setError(err.message); } 
        finally { setLoading(false); }
    };

    return (
        <>
            <div className="card">
                <h2 id="log-station-header">Daily Log Station</h2>
                <form onSubmit={handleSubmit} style={{marginTop: '1rem'}}>
                    <textarea id="log" rows="5" placeholder="I woke up feeling clear-headed..." value={log} onChange={(e) => setLog(e.target.value)}></textarea>
                    
                    <div className="sleep-inputs-container">
                        <div>
                            <label htmlFor="sleep-hours">Hours Slept 😴</label>
                            <input type="number" id="sleep-hours" min="0" max="24" step="0.5" placeholder="e.g., 7.5" value={sleepHours} onChange={e => setSleepHours(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="sleep-quality">Sleep Quality (1-5) ⭐</label>
                            <input type="number" id="sleep-quality" min="1" max="5" placeholder="1=Poor, 5=Excellent" value={sleepQuality} onChange={e => setSleepQuality(e.target.value)} />
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                        <button type="submit" disabled={loading}>{loading ? 'Analyzing...' : 'Analyze Log'}</button>
                        {loading && <div className="loader"></div>}
                    </div>
                </form>
            </div>
            {error && <div className="card"><p className="error-message">{error}</p></div>}
            {results && (
                <div className="card" id="results">
                    <div className="score"><span className="label">Mental Clarity:</span><span>{results.clarity_score}/10 ({results.clarity_label})</span></div>
                    <div className="score"><span className="label">Immune Risk:</span><span>{results.immune_score}/10 ({results.immune_label})</span></div>
                    <div className="score"><span className="label">Physical Output:</span><span>{results.physical_readiness_score}/10 ({results.physical_readiness_label})</span></div>
                    <div className="notes-section"><span className="label">AI Notes:</span><p>{results.ai_notes}</p></div>
                </div>
            )}
        </>
    );
}

export default LogEntry;