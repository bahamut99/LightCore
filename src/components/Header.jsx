import React from 'react';
import { supabase } from '../supabaseClient.js';

function Header() {
  const handleLogout = async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
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
        <a href="#" id="logout-link" className="header-btn" onClick={handleLogout}>Log Out</a>
      </div>
    </div>
  );
}

export default Header;