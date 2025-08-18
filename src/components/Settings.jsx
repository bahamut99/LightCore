// src/components/Settings.jsx
// Classic Settings panel — keeps UI preference sticky
// - Writes to public.profiles.preferred_view (RLS protected)
// - Mirrors to localStorage
// - Syncs URL ?view=… so routing stays consistent

import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const btn = {
  height: 36,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid rgba(0,240,255,.35)',
  background: 'linear-gradient(180deg, rgba(10,25,47,.85) 0%, rgba(10,25,47,.7) 100%)',
  color: '#cfefff',
  cursor: 'pointer',
  fontFamily: "'Orbitron', sans-serif",
  fontSize: 13,
  letterSpacing: '.04em',
};

function setURLView(view) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') !== view) {
      url.searchParams.set('view', view);
      window.history.replaceState({}, '', url.toString());
    }
  } catch {}
}

export default function Settings() {
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [pref, setPref] = useState('neural'); // default

  // Load current preference (URL → localStorage → profiles)
  useEffect(() => {
    (async () => {
      // URL override first
      const url = new URL(window.location.href);
      const q = url.searchParams.get('view');
      if (q === 'neural' || q === 'classic') {
        setPref(q);
        localStorage.setItem('preferred_view', q);
        return;
      }

      // localStorage next
      const stored = localStorage.getItem('preferred_view');
      if (stored === 'neural' || stored === 'classic') {
        setPref(stored);
        setURLView(stored);
        return;
      }

      // profiles (requires session)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('preferred_view')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && data?.preferred_view) {
          setPref(data.preferred_view);
          localStorage.setItem('preferred_view', data.preferred_view);
          setURLView(data.preferred_view);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function applyPref(view) {
    setPref(view);
    setSaving(true);
    setSavedTick(false);

    // Always mirror locally
    localStorage.setItem('preferred_view', view);
    setURLView(view);

    // Best effort write-through to profiles
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // update (profile row should exist via your auth trigger)
        await supabase.from('profiles').update({ preferred_view: view }).eq('id', user.id);
      }
    } catch {
      // swallow; local + url still keep it sticky
    } finally {
      setSaving(false);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1600);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h2>Settings</h2>

      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#9bd9ff', fontFamily: "'Orbitron', sans-serif", fontSize: 13, marginBottom: 8 }}>
          UI Preference
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => applyPref('neural')}
            disabled={saving}
            style={{
              ...btn,
              flex: 1,
              borderColor: pref === 'neural' ? '#38e8ff' : 'rgba(0,240,255,.35)',
            }}
          >
            Neural-Cortex
          </button>
          <button
            type="button"
            onClick={() => applyPref('classic')}
            disabled={saving}
            style={{
              ...btn,
              flex: 1,
              borderColor: pref === 'classic' ? '#38e8ff' : 'rgba(0,240,255,.35)',
            }}
          >
            Classic
          </button>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          {saving && <span style={{ color: '#9aa7bd', fontSize: 12 }}>Saving…</span>}
          {savedTick && <span style={{ color: '#00ff88', fontSize: 12 }}>Saved ✓</span>}
          {!saving && !savedTick && (
            <span style={{ color: '#98a9c1', fontSize: 12 }}>Loads automatically next sign-in.</span>
          )}
        </div>
      </div>

      {/* You can keep the rest of your settings sections below if you have them */}
    </div>
  );
}
