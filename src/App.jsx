import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';
import NeuralCortex from './components/NeuralCortex.jsx';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('neural'); // 'neural' | 'classic'

  useEffect(() => {
    const initializeApp = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      if (session) {
        try {
          // 1) If URL has ?view=..., respect it
          const urlView = new URL(window.location.href).searchParams.get('view');
          if (urlView === 'neural' || urlView === 'classic') {
            setCurrentView(urlView);
          } else {
            // 2) Try reading profiles.preferred_view
            const { data: prof } = await supabase
              .from('profiles')
              .select('preferred_view')
              .eq('id', session.user.id)
              .maybeSingle();

            let pref = prof?.preferred_view;

            // 3) Legacy fallback (your old Netlify function that returned preferred_ui)
            if (!pref) {
              try {
                const res = await fetch('/.netlify/functions/get-user-settings', {
                  headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                if (res.ok) {
                  const legacy = await res.json();
                  pref = legacy.preferred_ui;
                }
              } catch { /* ignore */ }
            }

            // 4) LocalStorage fallback
            pref = pref || localStorage.getItem('lc_view') || 'neural';
            setCurrentView(pref === 'classic' ? 'classic' : 'neural');
          }
        } catch {
          setCurrentView('neural');
        }
      }

      setLoading(false);
    };

    initializeApp();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        // Signed out
        setCurrentView('neural');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return null;
  }

  async function persistAndSwitch(view) {
    // Update in-memory
    setCurrentView(view);

    // Keep localStorage + URL in sync
    localStorage.setItem('lc_view', view);
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    window.history.replaceState({}, '', url.toString());

    // Persist to profiles.preferred_view
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .upsert({ id: user.id, preferred_view: view }, { onConflict: 'id' });
      }
    } catch (e) {
      console.warn('Failed to persist preferred_view:', e);
    }
  }

  const renderActiveView = () => {
    if (currentView === 'neural') {
      return <NeuralCortex onSwitchView={() => persistAndSwitch('classic')} />;
    } else {
      return <Dashboard onSwitchView={() => persistAndSwitch('neural')} />;
    }
  };

  return (
    <div>
      {!session ? <Auth /> : renderActiveView()}
    </div>
  );
}

export default App;
