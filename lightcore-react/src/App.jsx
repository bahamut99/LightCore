import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';

function App() {
  // This state will hold the user's session information
  const [session, setSession] = useState(null);

  // This useEffect runs once and listens for auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Cleanup the listener when the component unmounts
    return () => subscription.unsubscribe();
  }, []);

  // Conditionally render the correct component
  // If there is no session, show the Auth page.
  // If there IS a session, show the Dashboard.
  return (
    <div>
      {!session ? <Auth /> : <Dashboard key={session.user.id} />}
    </div>
  );
}

export default App;