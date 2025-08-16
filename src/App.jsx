import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';
import NeuralCortex from './components/NeuralCortex.jsx';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('neural'); // 'neural' is the default

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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