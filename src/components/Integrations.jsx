// src/components/Integrations.jsx
// Classic “Connected Services” card — simple, stable version.
// - Fetches steps once on load, then every 120s (if desired).
// - Keeps UI minimal and unchanged.

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

const STEPS_POLL_MS = 120_000; // 120s

export default function Integrations() {
  const [isLoading, setIsLoading] = useState(true);
  const [googleOn, setGoogleOn] = useState(false);
  const [steps, setSteps] = useState(null);
  const pollRef = useRef(null);

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const loadIntegrationStatus = async () => {
    try {
      // If you store a row per user with a boolean, read it here.
      // This is defensive: it won't crash if the table/column differs.
      const { data } = await supabase
        .from('user_integrations')
        .select('google_enabled')
        .single();
      setGoogleOn(!!data?.google_enabled);
    } catch {
      // If the table isn't present, just leave the toggle as-is.
    }
  };

  const fetchSteps = async () => {
    try {
      const headers = await getAuthHeader();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/.netlify/functions/fetch-health-data?tz=${encodeURIComponent(tz)}`, { headers });
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json?.steps === 'number') setSteps(json.steps);
    } catch {
      // swallow errors — never surface to the user
    }
  };

  useEffect(() => {
    setIsLoading(true);
    (async () => {
      await Promise.all([loadIntegrationStatus(), fetchSteps()]);
      setIsLoading(false);
      // Light polling to keep the number fresh without spamming APIs
      pollRef.current = setInterval(fetchSteps, STEPS_POLL_MS);
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectGoogle = async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/.netlify/functions/google-oauth-start', { method: 'POST', headers });
      if (res.ok) {
        setGoogleOn(true);
        fetchSteps();
      }
    } catch {}
  };

  const disconnectGoogle = async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/.netlify/functions/google-oauth-disconnect', { method: 'POST', headers });
      if (res.ok) {
        setGoogleOn(false);
        setSteps(null);
      }
    } catch {}
  };

  return (
    <div className="card">
      <h2>Connected Services</h2>

      <div className="integration-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <div style={{ fontWeight: 600, color: '#e5e7eb' }}>Google Health</div>
          <div className="subtle-text">{googleOn ? 'Connected' : 'Not connected'}</div>
        </div>
        <div>
          <label className="switch">
            <input
              type="checkbox"
              checked={googleOn}
              onChange={(e) => (e.target.checked ? connectGoogle() : disconnectGoogle())}
              disabled={isLoading}
            />
            <span className="slider" />
          </label>
        </div>
      </div>

      <div className="steps-box" style={{ marginTop: '1rem', textAlign: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#e5e7eb', lineHeight: 1 }}>
          {typeof steps === 'number' ? steps : 0}
        </div>
        <div className="subtle-text">Steps Today</div>
      </div>
    </div>
  );
}
