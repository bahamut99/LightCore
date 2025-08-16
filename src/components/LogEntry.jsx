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

// Now accepts onLogSubmitted prop
function LogEntry({ stepCount, onLogSubmitted }) {
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
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("You must be logged in.");

            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            const response = await fetchWithRetry('/.netlify/functions/analyze-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`},
                body: JSON.stringify({ 
                    log,
                    sleep_hours: sleepHours ? parseFloat(sleepHours) : null,
                    sleep_quality: sleepQuality ? parseInt(sleepQuality, 10) : null,
                    step_count: stepCount,
                    userTimezone: userTimezone
                })
            });

            if (!response.ok) { const d = await response.json(); throw new Error(d.error || `HTTP error! status: ${response.status}`); }

            const newLog = await response.json();
            
            // Clear the form for the next entry
            setLog('');
            setSleepHours('');
            setSleepQuality('');
            
            // Call the callback IMMEDIATELY after successful analysis to close the modal
            if (onLogSubmitted) {
                onLogSubmitted();
            } else {
                // Fallback for the Classic View to trigger a refresh
                window.dispatchEvent(new CustomEvent('newLogSubmitted'));
            }

            // Run the event parsing silently in the background. The UI is no longer waiting for this.
            fetch('/.netlify/functions/parse-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ log_id: newLog.id, log_text: newLog.log, userTimezone })
            });

        } catch (err) { setError(err.message); } 
        finally { setLoading(false); }
    };

    return (
        // The card now has a transparent background to blend with the modal
        <div className="card" style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>
            <h2 id="log-station-header" style={{ color: '#00f0ff' }}>New Log Entry</h2>
            <form onSubmit={handleSubmit} style={{marginTop: '1rem'}}>
                <textarea id="log" rows="5" placeholder="I woke up feeling clear-headed..." value={log} onChange={(e) => setLog(e.target.value)} className="futuristic-input"></textarea>
                
                <div className="sleep-inputs-container">
                    <div>
                        <label htmlFor="sleep-hours">Hours Slept</label>
                        <input type="number" id="sleep-hours" min="0" max="24" step="0.5" placeholder="e.g., 7.5" value={sleepHours} onChange={e => setSleepHours(e.target.value)} className="futuristic-input" />
                    </div>
                    <div>
                        <label htmlFor="sleep-quality">Sleep Quality (1-5)</label>
                        <input type="number" id="sleep-quality" min="1" max="5" placeholder="1=Poor, 5=Excellent" value={sleepQuality} onChange={e => setSleepQuality(e.target.value)} className="futuristic-input" />
                    </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                    <button type="submit" disabled={loading}>{loading ? 'Analyzing...' : 'Analyze Log'}</button>
                    {loading && <div className="loader"></div>}
                </div>
                {error && <p className="error-message" style={{textAlign: 'left', marginTop: '1rem'}}>{error}</p>}
            </form>
        </div>
    );
}

export default LogEntry;