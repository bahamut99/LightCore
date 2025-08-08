import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth.jsx';
// Import our new NeuralCortex component
import NeuralCortex from './components/NeuralCortex.jsx';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div>
      {/* We are temporarily replacing the Dashboard with the NeuralCortex */}
      {!session ? <Auth /> : <NeuralCortex />}
    </div>
  );
}

export default App;