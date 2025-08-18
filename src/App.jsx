import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';
import NeuralCortex from './components/NeuralCortex.jsx';

function readInitialView() {
  const url = new URL(window.location.href);
  const qp = url.searchParams.get('view');
  if (qp === 'classic' || qp === 'neural') return qp;
  const stored = localStorage.getItem('lc_view');
  if (stored === 'classic' || stored === 'neural') return stored;
  return 'neural';
}

export default function App() {
  // session: undefined = checking, null = not signed in, object = signed in
  const [session, setSession] = useState(undefined);
  const [currentView, setCurrentView] = useState(readInitialView());

  // Boot session (no artificial timeout)
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession()
      .then(({ data }) => { if (mounted) setSession(data.session ?? null); })
      .catch(() => { if (mounted) setSession(null); });

    const { data: authSub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s ?? null);
      if (!s) setCurrentView('neural');
    });

    return () => authSub.subscription?.unsubscribe?.();
  }, []);

  // If signed in, load preferred_view (non-blocking). Keep URL + localStorage in sync.
  useEffect(() => {
    let cancelled = false;

    async function loadPref() {
      if (!session?.user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('preferred_view')
        .eq('id', session.user.id)
        .maybeSingle();

      if (cancelled || error) return;
      const pref = (data?.preferred_view === 'classic') ? 'classic' : 'neural';

      setCurrentView(pref);
      localStorage.setItem('lc_view', pref);
      const url = new URL(window.location.href);
      url.searchParams.set('view', pref);
      history.replaceState({}, '', url);
    }

    loadPref();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  if (session === undefined) return null; // short boot

  const renderActiveView = () =>
    currentView === 'neural'
      ? <NeuralCortex onSwitchView={() => setCurrentView('classic')} />
      : <Dashboard onSwitchView={() => setCurrentView('neural')} />;

  return (
    <div>
      {!session ? <Auth /> : renderActiveView()}
    </div>
  );
}
