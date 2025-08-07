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

function Dashboard() {
    const [dashboardData, setDashboardData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [range, setRange] = useState(7); 

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
            const response = await fetch(`/.netlify/functions/get-dashboard-data?tz=${encodeURIComponent(userTimezone)}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (!response.ok) {
                throw new Error("Failed to fetch dashboard data");
            }
            const data = await response.json();
            setDashboardData(data);
        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            setDashboardData({}); 
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // The URL cleaning logic has been removed from here
        fetchDashboardData(false);
        
        const handleNewLog = () => fetchDashboardData(true);
        window.addEventListener('newLogSubmitted', handleNewLog);

        return () => {
            window.removeEventListener('newLogSubmitted', handleNewLog);
        };
    }, [fetchDashboardData]);

    return (
        <div id="app-container">
            <LightcoreMatrix logCount={dashboardData?.logCount || 0} />
            <Header />
            <main className="main-container">
                <div className="left-column">
                    <WeeklySummary isLoading={isLoading} data={dashboardData?.weeklySummaryData} />
                    <Trends range={range} setRange={setRange} />
                    <ChronoDeck isLoading={isLoading} data={dashboardData?.chronoDeckData} />
                </div>
                <div className="center-column">
                    <NudgeNotice data={dashboardData?.nudgeData} onAcknowledge={() => fetchDashboardData(true)} />
                    <LogEntry />
                    <RecentEntries isLoading={isLoading} data={dashboardData?.recentEntriesData} />
                </div>
                <div className="right-column">
                    <LightcoreGuide isLoading={isLoading} data={dashboardData?.lightcoreGuideData} logCount={dashboardData?.logCount || 0} />
                    <Integrations />
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