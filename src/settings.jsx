import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

function Settings() {
  const [preferredUi, setPreferredUi] = useState('neural');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await supabase
        .from('profiles')
        .select('preferred_view')
        .eq('id', session.user.id)
        .maybeSingle();

      const v = data?.preferred_view || 'neural';
      setPreferredUi(v);
    } catch (e) {
      console.error('Error fetching settings:', e);
      setMessage('Error loading your settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handlePreferenceChange = async (newPreference) => {
    setPreferredUi(newPreference);
    setMessage('Saving...');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) { setMessage('Not signed in.'); return; }

    try {
      await supabase
        .from('profiles')
        .upsert({ id: session.user.id, preferred_view: newPreference, updated_at: new Date().toISOString() });

      // keep SPA in sync immediately
      localStorage.setItem('lc_view', newPreference);
      const url = new URL(window.location.href);
      url.searchParams.set('view', newPreference);
      window.history.replaceState({}, '', url.toString());

      setMessage('Preference saved!');
      setTimeout(() => setMessage(''), 2000);
    } catch (e) {
      console.error('Error saving settings:', e);
      setMessage('Error saving. Please try again.');
    }
  };

  return (
    <div className="container">
      <header className="page-header">
        <img src="https://i.imgur.com/d5N9dkk.png" alt="LightCore Logo" className="logo" />
        <h1>Settings</h1>
      </header>
      <section className="card">
        <h2>Dashboard Preference</h2>
        <p>Choose your default dashboard experience. You can switch between them at any time.</p>

        {isLoading ? (
          <div className="loader" style={{ margin: '2rem auto' }}></div>
        ) : (
          <div className="preference-options" style={{ marginTop: '2rem' }}>
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
                <span style={{ fontSize: '0.9rem', color: '#9CA3AF' }}>The immersive, 3D data visualization experience.</span>
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
                <strong style={{ color: 'white', display: 'block' }}>LightCore Classic View</strong>
                <span style={{ fontSize: '0.9rem', color: '#9CA3AF' }}>The original, data-dense card layout.</span>
              </span>
            </label>
          </div>
        )}

        {message && <p className="message" style={{ marginTop: '2rem' }}>{message}</p>}
      </section>
      <div className="cta-section">
        <a href="/" className="button-secondary">Return to Dashboard</a>
      </div>
    </div>
  );
}

export default Settings;
