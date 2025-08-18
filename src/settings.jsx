import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

export default function Settings() {
  const [preferredUi, setPreferredUi] = useState('neural');
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setIsLoading(false); return; }

    const { data, error } = await supabase
      .from('profiles')
      .select('preferred_view')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!error && data) {
      setPreferredUi(data.preferred_view === 'classic' ? 'classic' : 'neural');
    } else {
      setPreferredUi('neural'); // default
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handlePreferenceChange = async (newPreference) => {
    setPreferredUi(newPreference);
    setSaving(true);
    setMessage('Saving…');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); setMessage('Not signed in.'); return; }

    // upsert so the row always exists
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, preferred_view: newPreference }, { onConflict: 'id' });

    setSaving(false);
    if (error) {
      setMessage('Could not save. Please try again.');
      return;
    }

    // reflect globally
    try { localStorage.setItem('lc_view', newPreference); } catch {}
    window.dispatchEvent(new CustomEvent('lc:view-changed', { detail: { view: newPreference } }));

    setMessage('Preference saved!');
    setTimeout(() => setMessage(''), 1800);
  };

  return (
    <div className="container">
      <header className="page-header">
        <img src="https://i.imgur.com/d5N9dkk.png" alt="LightCore Logo" className="logo" />
        <h1>Settings</h1>
      </header>

      <section className="card">
        <h2>Dashboard Preference</h2>
        <p>Choose your default dashboard. You can still switch any time.</p>

        {isLoading ? (
          <div className="loader" style={{ margin: '2rem auto' }} />
        ) : (
          <div className="preference-options" style={{ marginTop: '2rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="ui-preference"
                value="neural"
                checked={preferredUi === 'neural'}
                onChange={() => handlePreferenceChange('neural')}
                disabled={saving}
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
                disabled={saving}
              />
              <span style={{ marginLeft: '1rem' }}>
                <strong style={{ color: 'white', display: 'block' }}>Classic View</strong>
                <span style={{ fontSize: '0.9rem', color: '#9CA3AF' }}>Data-dense card layout.</span>
              </span>
            </label>

            {message && <p className="message" style={{ marginTop: '1.25rem' }}>{message}</p>}
          </div>
        )}
      </section>

      <div className="cta-section">
        <a href="/" className="button-secondary">Return to Dashboard</a>
      </div>
    </div>
  );
}
