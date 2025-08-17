import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';       // Classic
import NeuralCortex from './components/NeuralCortex.jsx'; // Cortex

// Normalize to our two values only
const normalizeView = (v) => (v === 'classic' ? 'classic' : 'neural');

// Keep ?view=<neural|classic> in the URL without reloading
function setUrlViewParam(view) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') !== view) {
      url.searchParams.set('view', view);
      window.history.replaceState({}, '', url.toString());
    }
  } catch {}
}

export default function App({ initialView = 'neural' }) {
  const [session, setSession] = useState(null);
  const [currentView, setCurrentView] = useState(normalizeView(initialView));
  const [booted, setBooted] = useState(false); // render ASAP; we don't block on remote fetches

  // —— Helpers to persist choice locally & remotely ——
  const persistLocal = useCallback((view) => {
    try { localStorage.setItem('lc_view', view); } catch {}
    setUrlViewParam(view);
  }, []);

  const persistRemoteIfSignedIn = useCallback(async (view) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase
        .from('profiles')
        .upsert({ id: session.user.id, preferred_view: view }, { onConflict: 'id' });
    } catch (e) {
      // non-fatal if RLS/connection temporarily blocks; local persistence still works
      console.warn('[App] persistRemoteIfSignedIn warn', e?.message || e);
    }
  }, []);

  const setAndPersistView = useCallback(async (view) => {
    const v = normalizeView(view);
    setCurrentView(v);
    persistLocal(v);
    await persistRemoteIfSignedIn(v);
  }, [persistLocal, persistRemoteIfSignedIn]);

  // —— On first mount: read initialView (from main.jsx) and stamp URL/localStorage ——
  useEffect(() => {
    const v = normalizeView(initialView);
    setCurrentView(v);
    persistLocal(v);
    setBooted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // —— Session init + subscribe ——
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      // Keep in sync with auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession);
        // If logged out, keep whatever local preference is; no need to reset
      });
      unsub = () => subscription.unsubscribe();

      // After knowing session, try to load remote preference (non-blocking)
      if (session?.user?.id) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('preferred_view')
            .eq('id', session.user.id)
            .maybeSingle();

          if (!error && data?.preferred_view) {
            const remote = normalizeView(data.preferred_view);
            if (remote !== currentView) {
              setCurrentView(remote);
              persistLocal(remote);
              setUrlViewParam(remote);
            }
          } else {
            // Fallback to your existing Netlify function if present
            try {
              const res = await fetch('/.netlify/functions/get-user-settings', {
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              if (res.ok) {
                const settings = await res.json();
                const remote = normalizeView(settings?.preferred_ui || settings?.preferred_view);
                if (remote && remote !== currentView) {
                  setCurrentView(remote);
                  persistLocal(remote);
                  setUrlViewParam(remote);
                }
              }
            } catch {/* ignore */}
          }
        } catch {/* ignore */}
      }
    })();
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // —— Render helpers ——
  const renderActiveView = () => {
    if (currentView === 'neural') {
      return <NeuralCortex onSwitchView={() => setAndPersistView('classic')} />;
    } else {
      return <Dashboard onSwitchView={() => setAndPersistView('neural')} />;
    }
  };

  // Render immediately after first mount (booted), even if remote pref fetch is still in flight
  if (!booted) return null;

  return (
    <div>
      {!session ? <Auth /> : renderActiveView()}
    </div>
  );
}
