import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';
import NeuralCortex from './components/NeuralCortex.jsx';

const fallbackPref = () => localStorage.getItem('lc_view') || 'neural';

// simple timeout wrapper so nothing can hang forever
function withTimeout(promise, ms, label = 'op') {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}: timeout`)), ms)),
  ]);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [currentView, setCurrentView] = useState(fallbackPref());

  const loadSession = useCallback(async () => {
    const { data: { session } } = await withTimeout(
      supabase.auth.getSession(),
      5000,
      'getSession'
    );
    setSession(session || null);
    return session;
  }, []);

  const ensureProfileAndGetPref = useCallback(async (userId) => {
    const { data: row } = await withTimeout(
      supabase
        .from('profiles')
        .select('preferred_view')
        .eq('id', userId)
        .maybeSingle(),
      5000,
      'select profiles'
    );

    if (!row) {
      // create default row if missing
      await withTimeout(
        supabase.from('profiles').upsert({ id: userId, preferred_view: 'neural' }, { onConflict: 'id' }),
        5000,
        'upsert profiles'
      );
      return 'neural';
    }
    return row.preferred_view === 'classic' ? 'classic' : 'neural';
  }, []);

  useEffect(() => {
    // hard fail-safe: never let boot screen stay forever
    const safetyTimer = setTimeout(() => {
      if (booting) {
        console.warn('Boot fail-safe fired; using fallback view.');
        setBooting(false);
      }
    }, 6000);

    (async () => {
      try {
        const sess = await loadSession();
        if (!sess) {
          // not logged in → just use local fallback
          setCurrentView(fallbackPref());
        } else {
          const pref = await ensureProfileAndGetPref(sess.user.id);
          setCurrentView(pref);
          localStorage.setItem('lc_view', pref);
        }
      } catch (e) {
        console.warn('Boot sequence degraded path:', e?.message || e);
        setCurrentView(fallbackPref());
      } finally {
        clearTimeout(safetyTimer);
        setBooting(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess || null);
      if (!sess) {
        setCurrentView('neural');
        localStorage.setItem('lc_view', 'neural');
      }
    });

    return () => listener?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount (we handle our own deps internally)

  const switchTo = async (view) => {
    setCurrentView(view);
    localStorage.setItem('lc_view', view);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ preferred_view: view }).eq('id', user.id);
      }
    } catch (e) {
      console.warn('Could not persist preference; will retry next session.', e?.message || e);
    }
  };

  if (booting) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0a0a1a',
        color: '#cfefff',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loader" style={{ margin: '0 auto 12px' }} />
          <div>Booting LightCore...</div>
        </div>
      </div>
    );
  }

  const renderActive = () =>
    currentView === 'neural'
      ? <NeuralCortex onSwitchView={() => switchTo('classic')} />
      : <Dashboard onSwitchView={() => switchTo('neural')} />;

  return (
    <div>
      {!session ? <Auth /> : renderActive()}
    </div>
  );
}
