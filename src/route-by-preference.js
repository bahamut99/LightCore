// SPA helper: keep ?view= in the URL and mirror to localStorage.
// IMPORTANT: no Supabase calls here (keeps boot fast & simple).

const ENTRY_PATHS = ['/', '/index.html'];
const pathname = () => new URL(window.location.href).pathname || '/';
const onEntryPage = () => ENTRY_PATHS.includes(pathname());

function readStored() {
  const v = localStorage.getItem('lc_view');
  return v === 'classic' || v === 'neural' ? v : null;
}

function setUrlViewParam(view) {
  const url = new URL(window.location.href);
  if (url.searchParams.get('view') === view) return;
  url.searchParams.set('view', view);
  window.history.replaceState({}, '', url.toString());
}

(function applyRouting() {
  if (!onEntryPage()) return;

  const url = new URL(window.location.href);
  let view = url.searchParams.get('view');
  if (view !== 'classic' && view !== 'neural') {
    view = readStored() || 'neural';
  }

  localStorage.setItem('lc_view', view);
  setUrlViewParam(view);
})();
