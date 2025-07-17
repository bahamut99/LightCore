import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Corrected path from ../ to ./
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';

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

  // While waiting for the session to be checked, show nothing to prevent flashes of content
  if (loading) {
    return null; 
  }

  // Conditionally render the Auth page or the main Dashboard
  return (
    <div>
      {!session ? <Auth /> : <Dashboard key={session.user.id} />}
    </div>
  );
}

export default App;