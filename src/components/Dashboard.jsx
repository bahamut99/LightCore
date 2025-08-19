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
import LightcoreMatrix from './LightcoreMatrix.jsx';
import Integrations from './Integrations.jsx';

// ⬇️ NEW: hook that renders the popup card and exposes show()/hide()
import useDailyCard from '../hooks/useDailyCard';

function Dashboard({ onSwitchView }) {
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [range, setRange] = useState(7);

  // ⬇️ NEW: card controller (Card is a React component)
  const dailyCard = useDailyCard();

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      setIsLoading(true);
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsLoading(false);
      return;
    }

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      const response = await fetch(
        `/.netlify/functions/get-dashboard-data?tz=${encodeURIComponent(userTimezone)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      const data = await response.json();
      setDashboardData(data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setDashboardData({});
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData(false);

    // When a new log is submitted, refresh the dashboard
    // AND show the latest row in a popup card (scores + ai_notes).
    const handleNewLog = async (evt) => {
      // 1) do your existing refresh
      fetchDashboardData(true);

      // 2) try to show the “daily result” card
      try {
        // If your event carries detail (row or id), prefer using it:
        //  - evt?.detail?.row  (full row)
        //  - evt?.detail?.id   (id only)
        if (evt?.detail?.row) {
          dailyCard.show(evt.detail.row);
          return;
        }
        if (evt?.detail?.id) {
          await dailyCard.showFromId(evt.detail.id);
          return;
        }

        // Otherwise, just fetch the most recent log for this user.
        const { data: latest, error } = await supabase
          .from('daily_logs')
          .select(
            'id, created_at, clarity_score, immune_score, physical_readiness_score, tags, ai_notes'
          )
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && latest) {
          dailyCard.show(latest);
        }
      } catch {
        // Fail silently—no user-facing errors
      }
    };

    window.addEventListener('newLogSubmitted', handleNewLog);
    return () => {
      window.removeEventListener('newLogSubmitted', handleNewLog);
    };
  }, [fetchDashboardData, dailyCard]);

  return (
    <div id="app-container">
      <LightcoreMatrix logCount={dashboardData?.logCount || 0} />
      <Header />
      <main className="main-container">
        <div className="left-column">
          <WeeklySummary
            isLoading={isLoading}
            data={dashboardData?.weeklySummaryData}
          />
          <Trends range={range} setRange={setRange} />
          <ChronoDeck
            isLoading={isLoading}
            data={dashboardData?.chronoDeckData}
          />
        </div>

        <div className="center-column">
          <NudgeNotice
            data={dashboardData?.nudgeData}
            onAcknowledge={() => fetchDashboardData(true)}
          />
          <LogEntry />
          <RecentEntries
            isLoading={isLoading}
            data={dashboardData?.recentEntriesData}
          />
        </div>

        <div className="right-column">
          <LightcoreGuide
            isLoading={isLoading}
            data={dashboardData?.lightcoreGuideData}
            logCount={dashboardData?.logCount || 0}
          />
          <Integrations />
        </div>
      </main>

      {/* ⬇️ NEW: the popup card (renders only when open) */}
      <dailyCard.Card />

      <div className="footer">
        <button
          onClick={onSwitchView}
          className="header-btn"
          style={{ marginRight: '1rem' }}
        >
          Switch to Neural-Cortex
        </button>
        <a href="about.html" className="footer-link">
          What is LightCore?
        </a>
        <span className="footer-separator">|</span>
        <a
          href="/privacy-policy.html"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          Privacy Policy
        </a>
      </div>
    </div>
  );
}

export default Dashboard;
