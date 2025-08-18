import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';
import NeuralCortex from './components/NeuralCortex.jsx';

/**
 * Rules:
 * - Read / write UI pref straight from public.profiles.preferred_view
 * - If row’s missing (first login), upsert one with default 'neural'
 * - Always show a visible loader (no more null/blank)
 * - Fall back to localStorage('lc_view') if DB not reachable
 */

const fallbackPref = () => localStorage.getItem('lc_view') || 'neural';

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [currentView, setCurrentView] = useState(fallbackPref());

  const loadSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session || null);
    return session;
  }, []);

  const ensureProfileAndGetPref = useCallback(async (userId) => {
    // Try to read
    const { data: row, error: selErr } = await supabase
      .from('profiles')
      .select('preferred_view')
      .eq('id', userId)
      .maybeSingle();

    if (selErr) throw selErr;

    // If missing, create default
    if (!row) {
      const { error: upErr } = await supabase
        .from('profiles')
        .upsert({ id: userId, preferred_view: 'neural' }, { onConflict: 'id' });
      if (upErr) throw upErr;
      return 'neural';
    }

    // Guard
    return row.preferred_view === 'classic' ? 'classic' : 'neural';
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const sess = await loadSession();
        if (!sess) {
          // Not logged in; use fallback pref
          setCurrentView(fallbackPref());
        } else {
          const pref = await ensureProfileAndGetPref(sess.user.id);
          setCurrentView(pref);
          localStorage.setItem('lc_view', pref);
        }
      } catch (e) {
        console.warn('Pref load failed, using fallback:', e);
        setCurrentView(fallbackPref());
      } finally {
        setBooting(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess || null);
      if (!sess) {
        setCurrentView('neural');
        localStorage.setItem('lc_view', 'neural');
      }
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, [loadSession, ensureProfileAndGetPref]);

  // Always render something (no blank)
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
          <div>Booting LightCore…</div>
        </div>
      </div>
    );
  }

  const switchTo = async (view) => {
    setCurrentView(view);
    localStorage.setItem('lc_view', view);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ preferred_view: view }).eq('id', user.id);
      }
    } catch (e) {
      console.warn('Could not persist preference (RLS/Offline). Will retry next boot.', e);
    }
  };

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
