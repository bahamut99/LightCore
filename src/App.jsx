import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';
import NeuralCortex from './components/NeuralCortex.jsx';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('neural'); // Default to neural while loading

  useEffect(() => {
    const initializeApp = async () => {
      // First, get the session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      setSession(session);

      // If a session exists, fetch the user's preferred UI setting
      if (session) {
        try {
          const response = await fetch('/.netlify/functions/get-user-settings', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (response.ok) {
            const settings = await response.json();
            setCurrentView(settings.preferred_ui || 'neural');
          }
        } catch (error) {
          console.error("Could not fetch user settings, defaulting to neural.", error);
          setCurrentView('neural');
        }
      }
      setLoading(false);
    };

    initializeApp();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // If the user logs out, we can reset the view
      if (!session) {
        setCurrentView('neural');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return null; 
  }

  const renderActiveView = () => {
    if (currentView === 'neural') {
      return <NeuralCortex onSwitchView={() => setCurrentView('classic')} />;
    } else {
      return <Dashboard onSwitchView={() => setCurrentView('neural')} />;
    }
  };

  return (
    <div>
      {!session ? <Auth /> : renderActiveView()}
    </div>
  );
}

export default App;