import React from 'react';
import { supabase } from '../supabaseClient.js';

function Header({ onSwitchView }) {
  const handleLogout = async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    // Optional: hard redirect to splash after sign-out
    window.location.href = '/';
  };

  const handleCortexMode = (e) => {
    e.preventDefault();
    if (typeof onSwitchView === 'function') {
      onSwitchView();
    } else {
      // Fallback: if no callback provided, try a route (adjust if your route differs)
      window.location.href = '/neural-cortex';
    }
  };

  return (
    <div className="header-container">
      <img
        src="/logo.png"
        alt="LightCore Logo"
        style={{ height: '44px' }}
      />
      <h1>LightCore - Your Bio Digital Twin</h1>

      <div className="header-actions">
        <a href="/settings.html" className="header-btn">Settings</a>
        {/* NEW: replaces "Resonance Core" and uses the compact header button style */}
        <button className="header-btn" onClick={handleCortexMode}>
          Cortex Mode
        </button>
        <a href="#" id="logout-link" className="header-btn" onClick={handleLogout}>
          Log Out
        </a>
      </div>
    </div>
  );
}

export default Header;

