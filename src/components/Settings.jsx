// src/components/Settings.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';

function Settings() {
  const [uiPref, setUiPref] = useState<'classic' | 'neural'>('classic');

  // Resolve the user’s preferred UI (profile first, then localStorage).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) Try profile (we try a few common column names defensively)
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      async function tryCol(col) {
        const { data, error } = await supabase
          .from('profiles')
          .select(col)
          .eq('id', userId)
          .single();
        if (!error && data && data[col]) return String(data[col]);
        return null;
      }

      let pref = null;
      if (userId) {
        // Try likely column names in order; ignore harmless "column does not exist" errors.
        pref =
          (await tryCol('ui_preference')) ||
          (await tryCol('preferred_ui')) ||
          (await tryCol('preferred_view')) ||
          (await tryCol('ui_mode'));
      }

      // 2) Fallback to localStorage
      if (!pref) {
        pref =
          localStorage.getItem('ui_preference') ||
          localStorage.getItem('preferred_ui') ||
          localStorage.getItem('preferredView') ||
          'classic';
      }

      const normalized =
        String(pref).toLowerCase().includes('neural') ? 'neural' : 'classic';
      if (!cancelled) setUiPref(normalized);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleHome = () => {
    // Send them to the appropriate “home” for their chosen UI.
    const target =
      uiPref === 'neural' ? '/resonance-chamber.html' : '/';
    window.location.href = target;
  };

  const handleExport = () => {
    // Wire this to your existing export flow if different
    window.location.href = '/.netlify/functions/export-data';
  };

  const handleDelete = () => {
    // If you already have a modal/flow, trigger it here instead
    const confirmed = confirm(
      'Delete your account and all associated data? This cannot be undone.'
    );
    if (!confirmed) return;

    // Example placeholder — replace with your real delete flow
    fetch('/.netlify/functions/delete-account', { method: 'POST' })
      .then(() => (window.location.href = '/'))
      .catch(() => alert('Unable to delete account right now.'));
  };

  return (
    <div id="app-container">
      {/* Minimal header for Settings: just Home */}
      <div className="header-container" style={{ marginBottom: '1rem' }}>
        <a href="#" className="header-btn" onClick={(e) => { e.preventDefault(); handleHome(); }}>
          Home
        </a>
      </div>

      {/* Centered settings card (leaves your existing styles intact) */}
      <main className="main-container" style={{ justifyContent: 'center' }}>
        <div className="center-column" style={{ maxWidth: 760 }}>
          <div className="card card-glass">
            <h2 style={{ justifyContent: 'flex-start' }}>Settings</h2>
            <p className="subtle-text" style={{ textAlign: 'left', marginTop: -8 }}>
              Tuning your experience &amp; privacy controls.
            </p>

            {/* UI preference buttons removed. We simply show what is active. */}
            <div className="guidance-section">
              <h4>UI Preference</h4>
              <p className="subtle-text" style={{ textAlign: 'left' }}>
                Current UI: <strong>{uiPref === 'neural' ? 'Neural-Cortex' : 'Classic'}</strong>.
                Use the Home button to return to your selected experience.
              </p>
            </div>

            <hr />

            <div className="guidance-section">
              <h4>Privacy</h4>
              <div style={{ display: 'flex', gap: '10px', marginTop: 6 }}>
                <button onClick={handleExport}>Export My Data</button>
                <button className="button-set-goal" onClick={handleDelete}>
                  Delete Account
                </button>
              </div>
              <p className="subtle-text" style={{ textAlign: 'left' }}>
                Stored with Row-Level Security. We don’t sell your data.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Settings;

