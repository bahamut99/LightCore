// src/route-by-preference.js
// Runs early to keep the app routed by a sticky preference.
// Order of truth: URL ?view → localStorage → profiles.preferred_view → 'neural'

import { supabase } from './supabaseClient';

const DEFAULT_VIEW = 'neural';

function setURLView(view) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') !== view) {
      url.searchParams.set('view', view);
      window.history.replaceState({}, '', url.toString());
    }
  } catch {
    /* ignore */
  }
}

async function resolveFromProfiles() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('preferred_view')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data?.preferred_view) return data.preferred_view;
    return null;
  } catch {
    return null;
  }
}

// IIFE so it executes on import before your SPA mounts.
(async function routeByPreference() {
  // 1) Explicit URL override (also mirror locally)
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('view');
    if (q === 'neural' || q === 'classic') {
      localStorage.setItem('preferred_view', q);
      setURLView(q);
      // best-effort write to profile (no blocking)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('profiles').update({ preferred_view: q }).eq('id', user.id);
      } catch {}
      return;
    }
  } catch {}

  // 2) localStorage
  const stored = localStorage.getItem('preferred_view');
  if (stored === 'neural' || stored === 'classic') {
    setURLView(stored);
    return;
  }

  // 3) profiles
  const prof = await resolveFromProfiles();
  if (prof) {
    localStorage.setItem('preferred_view', prof);
    setURLView(prof);
    return;
  }

  // 4) default
  localStorage.setItem('preferred_view', DEFAULT_VIEW);
  setURLView(DEFAULT_VIEW);
})();
