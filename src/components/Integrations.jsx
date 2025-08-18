import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

const STEPS_POLL_MS = 120_000;

export default function Integrations() {
  const [isLoading, setIsLoading] = useState(true);
  const [googleOn, setGoogleOn] = useState(false);
  const [steps, setSteps] = useState(null);
  const pollRef = useRef(null);

  // Get auth header (Supabase JWT) for Netlify Function calls
  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  // Read whether Google is connected from your user_integrations table
  const loadIntegrationStatus = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setGoogleOn(false);
        setSteps(null);
        setIsLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('user_integrations')
        .select('provider, access_token')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .maybeSingle();

      if (!error && data?.access_token) {
        setGoogleOn(true);
      } else {
        setGoogleOn(false);
        setSteps(null);
      }
    } catch {
      // quiet
    } finally {
      setIsLoading(false);
    }
  };

  // Quiet, timezone-aware step fetch (calls your Netlify function)
  const fetchSteps = async () => {
    if (!googleOn) {
      setSteps(null);
      return;
    }
    try {
      const headers = await getAuthHeader();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/.netlify/functions/fetch-health-data?tz=${encodeURIComponent(tz)}`, { headers });
      if (!res.ok) return; // stay quiet
      const j = await res.json().catch(() => null);
      if (j && typeof j.steps === 'number') setSteps(j.steps);
    } catch {
      // stay quiet; leave last known steps
    }
  };

  // Initial status + subscribe to auth changes
  useEffect(() => {
    loadIntegrationStatus();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      loadIntegrationStatus();
      // also refresh steps after re-auth
      fetchSteps();
    });

    return () => authSub?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start/stop polling when googleOn changes; always fetch once immediately
  useEffect(() => {
    fetchSteps();
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (googleOn) {
      pollRef.current = setInterval(fetchSteps, STEPS_POLL_MS);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleOn]);

  // Toggle handler:
  //  - If enabling and no token yet, kick off your existing Google auth flow.
  //  - If disabling, try to call a disconnect function (quietly), then refresh status.
  const onToggleGoogle = async () => {
    if (!googleOn) {
      // Start your existing connect flow (keep path as in your project)
      window.location.href = '/google-auth'; // adjust if your route differs
      return;
    }

    // Disconnect quietly if you have a function; otherwise just clear locally
    try {
      const headers = await getAuthHeader();
      await fetch('/.netlify/functions/disconnect-google', { headers }).catch(() => {});
    } catch {
      // ignore
    }
    // Refresh status from DB
    await loadIntegrationStatus();
    setSteps(null);
  };

  return (
    <div
      style={{
        background: 'rgba(16, 24, 40, 0.8)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: 16,
        color: '#cfefff',
      }}
    >
      <h3
        style={{
          margin: 0,
          marginBottom: 12,
          fontFamily: "'Orbitron', sans-serif",
          letterSpacing: '0.04em',
          fontSize: 14,
          color: '#9bd9ff',
        }}
      >
        CONNECTED SERVICES
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
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: googleOn ? '#30e88f' : '#54667a',
              boxShadow: googleOn ? '0 0 8px #30e88f' : 'none',
            }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Google Health</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {isLoading ? 'Checking…' : googleOn ? 'Connected' : 'Not connected'}
            </div>
          </div>
        </div>

        <button
          onClick={onToggleGoogle}
          aria-label="Toggle Google Health connection"
          aria-pressed={googleOn}
          title={googleOn ? 'Disconnect' : 'Connect'}
          style={{
            minWidth: 64,
            height: 34,
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.12)',
            background: googleOn ? 'linear-gradient(90deg,#16a34a,#22c55e)' : 'linear-gradient(90deg,#1f2937,#334155)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          {googleOn ? 'On' : 'Off'}
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Steps Today</div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>
          {typeof steps === 'number' ? steps : googleOn ? '—' : 0}
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
          {googleOn ? 'Updates on load, then every 2 minutes' : 'Connect Google to enable'}
        </div>
      </div>
    </div>
  );
}
