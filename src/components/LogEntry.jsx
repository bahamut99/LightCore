import React, { useState } from 'react';
import { supabase } from '../supabaseClient.js';

async function fetchWithRetry(url, options, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if ([502, 503, 504].includes(res.status)) {
        console.warn(`Attempt ${i + 1}: Server error ${res.status}. Retrying...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch {
      console.warn(`Attempt ${i + 1}: Network error. Retrying...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`Failed to fetch after ${retries} attempts.`);
}

// Renders the Classic “New Log Entry” form and, after submit, a LightCore Analysis card.
function LogEntry({ stepCount, onLogSubmitted }) {
  const [log, setLog] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  const [sleepQuality, setSleepQuality] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!log.trim()) { alert('Please enter a log entry.'); return; }

    setLoading(true);
    setResults(null);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('You must be logged in.');

      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const payload = {
        log,
        sleep_hours: sleepHours !== '' ? parseFloat(sleepHours) : null,
        sleep_quality: sleepQuality !== '' ? parseInt(sleepQuality, 10) : null,
        step_count: Number.isFinite(Number(stepCount)) ? Number(stepCount) : null,
        userTimezone
      };

      const res = await fetchWithRetry('/.netlify/functions/analyze-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const d = await res.json();
          msg = d?.error || msg;
        } catch {/* ignore */}
        throw new Error(msg);
      }

      const body = await res.json();
      const newLog = body?.data ?? body; // supports either shape

      // paint the analysis card
      setResults(newLog);

      // clear the form
      setLog('');
      setSleepHours('');
      setSleepQuality('');

      // notify parent/dashboard after a tick so the card can render first
      setTimeout(() => {
        if (onLogSubmitted) {
          onLogSubmitted();
        } else {
          window.dispatchEvent(new CustomEvent('newLogSubmitted'));
        }
      }, 100);

      // fire-and-forget event parsing (no await)
      fetch('/.netlify/functions/parse-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          log_id: newLog.id,
          log_text: newLog.log,
          userTimezone,
        }),
      }).catch(() => {});
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Entry form */}
      <div className="card" style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>
        <h2 id="log-station-header" style={{ color: '#00f0ff' }}>New Log Entry</h2>
        <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
          <textarea
            id="log"
            rows="5"
            placeholder="I woke up feeling clear-headed..."
            value={log}
            onChange={(e) => setLog(e.target.value)}
            className="futuristic-input"
          />
          <div className="sleep-inputs-container">
            <div>
              <label htmlFor="sleep-hours">Hours Slept</label>
              <input
                type="number"
                id="sleep-hours"
                min="0"
                max="24"
                step="0.5"
                placeholder="e.g., 7.5"
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                className="futuristic-input"
              />
            </div>
            <div>
              <label htmlFor="sleep-quality">Sleep Quality (1-5)</label>
              <input
                type="number"
                id="sleep-quality"
                min="1"
                max="5"
                placeholder="1=Poor, 5=Excellent"
                value={sleepQuality}
                onChange={(e) => setSleepQuality(e.target.value)}
                className="futuristic-input"
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" disabled={loading}>
              {loading ? 'Analyzing...' : 'Analyze Log'}
            </button>
            {loading && <div className="loader" />}
          </div>

          {error && <p className="error-message" style={{ textAlign: 'left', marginTop: '1rem' }}>{error}</p>}
        </form>
      </div>

      {/* LightCore Analysis card (appears after successful submit) */}
      {results && (
        <div className="card" id="results">
          <h2>LightCore Analysis</h2>
          <div className="score">
            <span className="label">Mental Clarity:</span>
            <span>{results.clarity_score}/10 ({results.clarity_label})</span>
          </div>
          <div className="score">
            <span className="label">Immune Defense:</span>
            <span>{results.immune_score}/10 ({results.immune_label})</span>
          </div>
          <div className="score">
            <span className="label">Physical Readiness:</span>
            <span>{results.physical_readiness_score}/10 ({results.physical_readiness_label})</span>
          </div>
          {results.ai_notes && (
            <div className="notes-section">
              <span className="label">AI Notes:</span>
              <p>{results.ai_notes}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default LogEntry;
