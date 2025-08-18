import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';
import NeuralCortex from './components/NeuralCortex.jsx';

const VALID = new Set(['neural', 'classic']);
const getUrlView = () => {
  const p = new URL(window.location.href).searchParams.get('view');
  return VALID.has(p) ? p : null;
};

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('neural'); // default

  const setAndPersistView = async (view) => {
    const safe = VALID.has(view) ? view : 'neural';
    setCurrentView(safe);
    // persist locally + URL for SPA routing
    localStorage.setItem('lc_view', safe);
    const url = new URL(window.location.href);
    url.searchParams.set('view', safe);
    window.history.replaceState({}, '', url.toString());
    // persist to DB if logged in
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      await supabase
        .from('profiles')
        .upsert({ id: session.user.id, preferred_view: safe, updated_at: new Date().toISOString() });
    }
  };

  useEffect(() => {
    const initialize = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      let chosen = getUrlView();

      if (!chosen && session?.user?.id) {
        // try DB
        const { data } = await supabase
          .from('profiles')
          .select('preferred_view')
          .eq('id', session.user.id)
          .maybeSingle();

        if (data?.preferred_view) chosen = data.preferred_view;
      }

      if (!chosen) {
        // fallback to localStorage
        const local = localStorage.getItem('lc_view');
        if (VALID.has(local)) chosen = local;
      }

      if (!chosen) chosen = 'neural';

      // sync everything (URL/local/DB) and update UI
      await setAndPersistView(chosen);
      setLoading(false);
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      // Re-initialize preference when auth state changes
      (async () => {
        if (sess) {
          const { data } = await supabase
            .from('profiles')
            .select('preferred_view')
            .eq('id', sess.user.id)
            .maybeSingle();
          const v = data?.preferred_view || getUrlView() || localStorage.getItem('lc_view') || 'neural';
          await setAndPersistView(v);
        } else {
          // if logged out, keep whatever is in URL/local; default to neural
          const v = getUrlView() || localStorage.getItem('lc_view') || 'neural';
          setCurrentView(VALID.has(v) ? v : 'neural');
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;

  const renderActiveView = () => {
    if (currentView === 'neural') {
      return <NeuralCortex onSwitchView={() => setAndPersistView('classic')} />;
    }
    return <Dashboard onSwitchView={() => setAndPersistView('neural')} />;
  };

  return <div>{!session ? <Auth /> : renderActiveView()}</div>;
}

export default App;
