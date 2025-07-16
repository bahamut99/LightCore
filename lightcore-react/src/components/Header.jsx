import React from 'react';

function Header() {
  // This component's only job is to display the header UI.
  return (
    <div className="header-container">
      <img
        src="https://i.imgur.com/d5N9dkk.png"
        alt="LightCore Logo"
        style={{ height: '44px' }}
      />
      <h1>LightCore - Your Bio Digital Twin</h1>
      <div className="header-actions">
        <a href="goals.html" className="header-btn">My Goals</a>
        <a href="#" id="logout-link" className="header-btn">Log Out</a>
      </div>
    </div>
  );
}

export default Header;