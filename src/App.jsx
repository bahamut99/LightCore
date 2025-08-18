import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';
import NeuralCortex from './components/NeuralCortex.jsx';

// helpers
const getUrlView = () => new URL(window.location.href).searchParams.get('view');
const getStoredView = () => localStorage.getItem('lc_view');

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('neural'); // default

  // write the view everywhere so other tabs / scripts can see it
  const applyView = useCallback((view) => {
    const v = view === 'classic' ? 'classic' : 'neural';
    setCurrentView(v);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('view') !== v) {
        url.searchParams.set('view', v);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {}
    try { localStorage.setItem('lc_view', v); } catch {}
  }, []);

  // read user preference from DB
  const fetchPreferredView = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('preferred_view')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) return null;
    return (data?.preferred_view === 'classic') ? 'classic' : 'neural';
  }, []);

  // initial boot
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      // 1) DB wins (if logged in)
      let view = null;
      if (session) {
        view = await fetchPreferredView();
      }

      // 2) URL ?view=… next
      if (!view) {
        const urlView = getUrlView();
        if (urlView === 'classic' || urlView === 'neural') view = urlView;
      }

      // 3) localStorage fallback
      if (!view) {
        const stored = getStoredView();
        if (stored === 'classic' || stored === 'neural') view = stored;
      }

      applyView(view || 'neural');
      setLoading(false);
    })();

    // auth change: keep session & reset to default when logged out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess);
      if (!sess) applyView('neural');
      else {
        const v = await fetchPreferredView();
        applyView(v || 'neural');
      }
    });

    // listen for cross-component changes
    const handler = (e) => applyView(e.detail?.view);
    window.addEventListener('lc:view-changed', handler);

    return () => {
      subscription?.unsubscribe?.();
      window.removeEventListener('lc:view-changed', handler);
    };
  }, [applyView, fetchPreferredView]);

  if (loading) return null;

  const renderActiveView = () => {
    if (currentView === 'neural') {
      return (
        <NeuralCortex
          onSwitchView={() => applyView('classic')}
        />
      );
    }
    return (
      <Dashboard
        onSwitchView={() => applyView('neural')}
      />
    );
  };

  return (
    <div>
      {!session ? <Auth /> : renderActiveView()}
    </div>
  );
}
