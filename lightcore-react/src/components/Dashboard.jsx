import React from 'react';

import Header from './Header.jsx';
import WeeklyProgress from './WeeklyProgress.jsx';
import Trends from './Trends.jsx';
import ChronoDeck from './ChronoDeck.jsx';
import LogEntry from './LogEntry.jsx';
import RecentEntries from './RecentEntries.jsx';
import LightcoreGuide from './LightcoreGuide.jsx'; // Import the final component

function Dashboard() {
  return (
    <div id="app-container">
      <Header />
      <main className="main-container">
        <div className="left-column">
          <WeeklyProgress />
          <Trends />
          <ChronoDeck />
        </div>
        <div className="center-column">
          <LogEntry />
          <RecentEntries />
        </div>
        <div className="right-column">
          {/* All placeholders are now replaced with real components */}
          <LightcoreGuide />
        </div>
      </main>
      <div className="footer">
        <a href="about.html" className="footer-link">What is LightCore?</a>
      </div>
    </div>
  );
}

export default Dashboard;