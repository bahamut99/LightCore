import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

// Poll every 120s
const STEPS_POLL_MS = 120_000;

export default function Integrations() {
  const [googleOn, setGoogleOn] = useState(false);
  const [steps, setSteps] = useState(null);
  const [isToggling, setIsToggling] = useState(false);
  const pollRef = useRef(null);

  // --- helpers ---
  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const loadIntegrationStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_integrations')
        .select('google_connected')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && data) {
        setGoogleOn(!!data.google_connected);
      } else {
        setGoogleOn(false);
      }
    } catch {
      setGoogleOn(false);
    }
  };

  const fetchStepsOnce = async () => {
    try {
      // Only fetch when connected
      if (!googleOn) return;

      const headers = await getAuthHeader();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const res = await fetch(
        `/.netlify/functions/fetch-health-data?tz=${encodeURIComponent(tz)}`,
        { headers }
      );

      if (!res.ok) return;
      const json = await res.json();
      if (typeof json?.steps === 'number') setSteps(json.steps);
    } catch {
      // swallow; no user-facing errors
    }
  };

  // --- effects ---
  // Initial status + first steps fetch
  useEffect(() => {
    loadIntegrationStatus().then(fetchStepsOnce).catch(() => {});
  }, []);

  // Poll steps every 120s while connected
  useEffect(() => {
    // clear old timer
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (googleOn) {
      // run immediately
      fetchStepsOnce();
      pollRef.current = setInterval(fetchStepsOnce, STEPS_POLL_MS);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [googleOn]);

  // --- actions ---
  const toggleGoogle = async () => {
    try {
      setIsToggling(true);
      const turningOn = !googleOn;

      if (turningOn) {
        // Start OAuth – server returns the Google consent URL
        const headers = await getAuthHeader();
        const linkRes = await fetch('/.netlify/functions/google-auth-link', { headers });
        if (!linkRes.ok) {
          setIsToggling(false);
          return;
        }
        const { url } = await linkRes.json();
        // Redirect to Google; on return your backend sets google_connected=true
        window.location.href = url;
        return; // stop here; page will navigate
      } else {
        // Disconnect / revoke
        const headers = await getAuthHeader();
        await fetch('/.netlify/functions/google-disconnect', { method: 'POST', headers }).catch(() => {});
        // Best-effort local state update (DB row is updated by the function)
        setGoogleOn(false);
        setSteps(null);
      }
    } finally {
      setIsToggling(false);
    }
  };

  // --- UI (stable, minimal) ---
  return (
    <div
      style={{
        background: 'rgba(15,25,38,0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h3 style={{ margin: 0, marginBottom: 12, color: '#cfe3ff', fontWeight: 600 }}>
        Connected Services
      </h3>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 12px',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: '#4285F4',
              display: 'grid',
              placeItems: 'center',
              color: 'white',
              fontWeight: 700,
              fontSize: 14,
            }}
            aria-hidden
          >
            G
          </div>
          <div>
            <div style={{ color: 'white', fontWeight: 600, lineHeight: 1.2 }}>
              Google Health
            </div>
            <div style={{ color: '#9db4d4', fontSize: 12 }}>
              {googleOn ? 'Connected' : 'Not connected'}
            </div>
          </div>
        </div>

        <button
          onClick={toggleGoogle}
          disabled={isToggling}
          style={{
            minWidth: 72,
            height: 34,
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.12)',
            background: googleOn ? 'linear-gradient(180deg,#2dd4bf,#14b8a6)' : 'rgba(255,255,255,0.06)',
            color: googleOn ? '#062b27' : '#dbeafe',
            fontWeight: 700,
            cursor: 'pointer',
          }}
          aria-pressed={googleOn}
        >
          {googleOn ? 'On' : 'Off'}
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: '18px 14px',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          textAlign: 'center',
        }}
      >
        <div style={{ color: '#9db4d4', fontSize: 12, marginBottom: 6 }}>Steps Today</div>
        <div style={{ color: 'white', fontSize: 36, fontWeight: 800, lineHeight: 1 }}>
          {googleOn ? (steps ?? '—') : 0}
        </div>
        {!googleOn && (
          <div style={{ color: '#8aa0bf', fontSize: 12, marginTop: 6 }}>
            Connect Google to enable
          </div>
        )}
      </div>
    </div>
  );
}
