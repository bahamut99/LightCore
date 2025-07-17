import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // This path must be correct
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for an active session when the app loads
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false); // Stop loading once the session is checked
    });

    // Listen for changes in authentication state (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Cleanup the listener when the component is no longer on screen
    return () => subscription.unsubscribe();
  }, []);

  // While waiting for the session to be checked, show nothing to prevent flashes of content
  if (loading) {
    return null; 
  }

  // Once loading is false, show either the Auth page or the main Dashboard
  return (
    <div>
      {!session ? <Auth /> : <Dashboard key={session.user.id} />}
    </div>
  );
}

export default App;