import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient.js';

export default function Settings() {
  const [preferredUi, setPreferredUi] = useState('neural');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setIsLoading(false); return; }

      const { data, error } = await supabase
        .from('profiles')
        .select('preferred_view')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!cancelled) {
        if (!error && (data?.preferred_view === 'classic' || data?.preferred_view === 'neural')) {
          setPreferredUi(data.preferred_view);
        }
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handlePreferenceChange = async (newPreference) => {
    setPreferredUi(newPreference);
    setMessage('Saving...');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage('Not signed in.'); return; }

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, preferred_view: newPreference });

    if (error) {
      setMessage('Error saving. Please try again.');
      return;
    }

    // Mirror locally so the app reflects immediately on reload.
    localStorage.setItem('lc_view', newPreference);
    const url = new URL(window.location.href);
    url.searchParams.set('view', newPreference);
    history.replaceState({}, '', url);

    setMessage('Saved ✓');
    setTimeout(() => setMessage(''), 1500);
  };

  return (
    <div className="container">
      <header className="page-header">
        <img src="https://i.imgur.com/d5N9dkk.png" alt="LightCore Logo" className="logo" />
        <h1>Settings</h1>
      </header>

      <section className="card">
        <h2>Dashboard Preference</h2>
        <p>Choose your default dashboard experience. You can switch any time.</p>

        {isLoading ? (
          <div className="loader" style={{margin: '2rem auto'}}></div>
        ) : (
          <div style={{marginTop: '1.25rem'}}>
            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="ui-preference"
                value="neural"
                checked={preferredUi === 'neural'}
                onChange={() => handlePreferenceChange('neural')}
              />
              <span style={{ marginLeft: '1rem' }}>
                <strong style={{ color: 'white', display: 'block' }}>Neural-Cortex</strong>
                <span style={{ fontSize: '0.9rem', color: '#9CA3AF' }}>Immersive 3D experience.</span>
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="ui-preference"
                value="classic"
                checked={preferredUi === 'classic'}
                onChange={() => handlePreferenceChange('classic')}
              />
              <span style={{ marginLeft: '1rem' }}>
                <strong style={{ color: 'white', display: 'block' }}>Classic</strong>
                <span style={{ fontSize: '0.9rem', color: '#9CA3AF' }}>Data-dense card layout.</span>
              </span>
            </label>
          </div>
        )}

        {message && <p className="message" style={{ marginTop: '1.25rem' }}>{message}</p>}
      </section>

      <div className="cta-section">
        <a href="/" className="button-secondary">Return to Dashboard</a>
      </div>
    </div>
  );
}
