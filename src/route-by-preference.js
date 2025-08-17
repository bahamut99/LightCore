// src/route-by-preference.js
// SPA mode: Only runs on index.html. Ensures URL carries ?view=<neural|classic>
// and stores the choice in localStorage for your React app to read.

import { supabase } from '/src/supabaseClient.js';

// In SPA, both dashboards live at the same HTML (index.html)
const ENTRY_PATHS = ['/', '/index.html'];

// Helpers
const pathname = () => new URL(window.location.href).pathname || '/';
const onEntryPage = () => ENTRY_PATHS.includes(pathname());
const getViewFromUrl = () => new URL(window.location.href).searchParams.get('view');

async function getPreferredView() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('preferred_view')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) return null;
  // DB stores 'classic' or 'neural' (where 'neural' = Cortex)
  return data?.preferred_view === 'classic' ? 'classic' : 'neural';
}

function setUrlViewParam(view) {
  const url = new URL(window.location.href);
  const current = url.searchParams.get('view');
  if (current === view) return;
  url.searchParams.set('view', view);
  // Do not reload; just replace the URL so React can read it
  window.history.replaceState({}, '', url.toString());
}

async function applyRouting() {
  if (!onEntryPage()) return;

  const pref = await getPreferredView();
  if (!pref) return;

  // Persist for React to read if it wants
  localStorage.setItem('lc_view', pref);         // e.g., 'neural' or 'classic'
  window.__LC_VIEW__ = pref;                     // optional global

  // Ensure URL carries ?view=...
  setUrlViewParam(pref);
}

// Run on load + on auth changes
applyRouting();
supabase.auth.onAuthStateChange(() => applyRouting());
