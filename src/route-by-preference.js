// SPA helper: make sure URL keeps ?view=neural|classic and mirror to localStorage
import { supabase } from '/src/supabaseClient.js';

const ENTRY_PATHS = ['/', '/index.html'];
const pathname = () => new URL(window.location.href).pathname || '/';
const onEntryPage = () => ENTRY_PATHS.includes(pathname());
const getUrlView = () => new URL(window.location.href).searchParams.get('view');

function setUrlViewParam(view) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') !== view) {
      url.searchParams.set('view', view);
      window.history.replaceState({}, '', url.toString());
    }
  } catch {}
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
  return data?.preferred_view === 'classic' ? 'classic' : 'neural';
}

async function applyRouting() {
  if (!onEntryPage()) return;

  // 1) DB wins if logged in
  let view = await getPreferredViewFromDB();

  // 2) URL next
  if (!view) {
    const urlView = getUrlView();
    if (urlView === 'classic' || urlView === 'neural') view = urlView;
  }

  // 3) localStorage fallback
  if (!view) {
    const stored = localStorage.getItem('lc_view');
    if (stored === 'classic' || stored === 'neural') view = stored;
  }

  if (!view) view = 'neural';

  // mirror everywhere
  localStorage.setItem('lc_view', view);
  setUrlViewParam(view);
  // broadcast so App (if already mounted) reacts
  window.dispatchEvent(new CustomEvent('lc:view-changed', { detail: { view } }));
}

applyRouting();
supabase.auth.onAuthStateChange(() => applyRouting());
