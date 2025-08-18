// Single Page App helper: keep ?view=<neural|classic> in the URL for shareability.
// NOTE: This file is imported by main.jsx so it is bundled correctly.

import { supabase } from './supabaseClient.js';

const ENTRY_PATHS = ['/', '/index.html'];
const pathname = () => new URL(window.location.href).pathname || '/';
const onEntryPage = () => ENTRY_PATHS.includes(pathname());
const getViewFromUrl = () => new URL(window.location.href).searchParams.get('view');

function setUrlViewParam(view) {
  const url = new URL(window.location.href);
  const current = url.searchParams.get('view');
  if (current === view) return;
  url.searchParams.set('view', view);
  window.history.replaceState({}, '', url.toString());
}

async function getPreferredView() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return localStorage.getItem('lc_view') || 'neural';

  const { data, error } = await supabase
    .from('profiles')
    .select('preferred_view')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) return localStorage.getItem('lc_view') || 'neural';
  return (data?.preferred_view === 'classic') ? 'classic' : 'neural';
}

async function applyRouting() {
  if (!onEntryPage()) return;
  const fromUrl = getViewFromUrl();
  if (fromUrl === 'neural' || fromUrl === 'classic') {
    localStorage.setItem('lc_view', fromUrl);
    return;
  }
  const pref = await getPreferredView();
  localStorage.setItem('lc_view', pref);
  setUrlViewParam(pref);
}

applyRouting();
supabase.auth.onAuthStateChange(() => applyRouting());
