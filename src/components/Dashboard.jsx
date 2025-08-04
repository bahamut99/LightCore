import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import Header from './Header.jsx';
import WeeklySummary from './WeeklySummary.jsx';
import Trends from './Trends.jsx';
import ChronoDeck from './ChronoDeck.jsx';
import LogEntry from './LogEntry.jsx';
import RecentEntries from './RecentEntries.jsx';
import LightcoreGuide from './LightcoreGuide.jsx';
import NudgeNotice from './NudgeNotice.jsx';

function Dashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [range, setRange] = useState(7);
  // FIX: Add state to manage the currently viewed date for ChronoDeck
  const [currentDate, setCurrentDate] = useState(new Date());

  const fetchDashboardData = useCallback(async () => {
    // We set isLoading true for the components that depend on this fetch
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/.netlify/functions/get-dashboard-data?range=${range}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!response.ok) {
        throw new Error("Failed to fetch dashboard data");
      }
      const data = await response.json();
      // We no longer need chronoDeckData here as the component fetches its own data
      const { chronoDeckData, ...restOfData } = data;
      setDashboardData(restOfData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchDashboardData();
    window.addEventListener('newLogSubmitted', fetchDashboardData);
    return () => {
      window.removeEventListener('newLogSubmitted', fetchDashboardData);
    };
  }, [fetchDashboardData]);

  return (
    <div id="app-container">
      <Header />
      <main className="main-container">
        <div className="left-column">
          <WeeklySummary isLoading={isLoading} data={dashboardData?.weeklySummaryData} />
          <Trends isLoading={isLoading} data={dashboardData?.trendsData} range={range} setRange={setRange} />
          {/* FIX: Pass the currentDate prop. ChronoDeck now handles its own loading/data. */}
          <ChronoDeck currentDate={currentDate} />
        </div>
        <div className="center-column">
          <NudgeNotice data={dashboardData?.nudgeData} onAcknowledge={fetchDashboardData} />
          <LogEntry />
          <RecentEntries isLoading={isLoading} data={dashboardData?.recentEntriesData} />
        </div>
        <div className="right-column">
          <LightcoreGuide isLoading={isLoading} data={dashboardData?.lightcoreGuideData} />
        </div>
      </main>
      <div className="footer">
        <a href="about.html" className="footer-link">What is LightCore?</a>
        <span className="footer-separator">|</span>
        <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="footer-link">Privacy Policy</a>
      </div>
    </div>
  );
}

export default Dashboard;