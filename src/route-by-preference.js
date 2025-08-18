// Ensures the URL carries ?view=<neural|classic> in SPA mode and
// keeps localStorage in sync with the user's saved preference.

import { supabase } from '/src/supabaseClient.js';

const ENTRY_PATHS = ['/', '/index.html'];
const VALID = new Set(['neural', 'classic']);

const pathname = () => new URL(window.location.href).pathname || '/';
const onEntryPage = () => ENTRY_PATHS.includes(pathname());
const getUrlView = () => {
  const v = new URL(window.location.href).searchParams.get('view');
  return VALID.has(v) ? v : null;
};

function setUrlViewParam(view) {
  const url = new URL(window.location.href);
  if (url.searchParams.get('view') === view) return;
  url.searchParams.set('view', view);
  window.history.replaceState({}, '', url.toString());
}

async function getPreferredViewFromDB() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('preferred_view')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) return null;

  if (!data) {
    // seed default
    await supabase.from('profiles').upsert({
      id: session.user.id,
      preferred_view: 'neural',
      updated_at: new Date().toISOString()
    });
    return 'neural';
  }
  const v = data?.preferred_view;
  return VALID.has(v) ? v : 'neural';
}

async function applyRouting() {
  if (!onEntryPage()) return;

  // Priority: URL > DB > localStorage > default
  const urlView = getUrlView();
  if (urlView) {
    localStorage.setItem('lc_view', urlView);
    return;
  }

  const dbView = await getPreferredViewFromDB();
  const fallback = localStorage.getItem('lc_view');
  const view = dbView || (VALID.has(fallback) ? fallback : 'neural');

  localStorage.setItem('lc_view', view);
  setUrlViewParam(view);
}

applyRouting();
supabase.auth.onAuthStateChange(() => applyRouting());
