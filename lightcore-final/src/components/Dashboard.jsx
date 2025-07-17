import React from 'react';
import Header from './Header.jsx';
import WeeklySummary from './WeeklySummary.jsx';
import Trends from './Trends.jsx';
import ChronoDeck from './ChronoDeck.jsx';
import LogEntry from './LogEntry.jsx';
import RecentEntries from './RecentEntries.jsx';
import LightcoreGuide from './LightcoreGuide.jsx';

function Dashboard() {
  return (
    <div id="app-container">
      <Header />
      <main className="main-container">
        <div className="left-column">
          <WeeklySummary />
          <Trends />
          <ChronoDeck />
        </div>
        <div className="center-column">
          <LogEntry />
          <RecentEntries />
        </div>
        <div className="right-column">
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