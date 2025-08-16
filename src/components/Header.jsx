import React from 'react';
import { supabase } from '../supabaseClient.js';

function Header() {
  const handleLogout = async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
  };

  const handleNavigateToChamber = async (e) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      sessionStorage.setItem('supabase.auth.token', session.access_token);
      window.location.href = '/resonance-chamber.html';
    } else {
      alert('Could not find active session. Please log in again.');
    }
  };

  return (
    <div className="header-container">
      <img
        src="https://i.imgur.com/d5N9dkk.png"
        alt="LightCore Logo"
        style={{ height: '44px' }}
      />
      <h1>LightCore - Your Bio Digital Twin</h1>
      <div className="header-actions">
        <a href="/settings.html" className="header-btn">Settings</a>
        <a href="#" className="header-btn" onClick={handleNavigateToChamber}>Resonance Core</a>
        <a href="#" id="logout-link" className="header-btn" onClick={handleLogout}>Log Out</a>
      </div>
    </div>
  );
}

export default Header;