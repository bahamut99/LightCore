import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

function RecentEntries() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRecentLogs = useCallback(async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/.netlify/functions/recent-logs', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!response.ok) throw new Error("Failed to load recent logs");
      const recentLogs = await response.json();
      setLogs(recentLogs || []);
    } catch (error) {
      console.error("Failed to load logs:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecentLogs();
    window.addEventListener('newLogSubmitted', fetchRecentLogs);
    return () => {
      window.removeEventListener('newLogSubmitted', fetchRecentLogs);
    };
  }, [fetchRecentLogs]);

  const Td = ({ children, color }) => {
    if (color) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      const style = {
        color: color,
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`
      };
      return <td><span className="score-bubble" style={style}>{children}</span></td>;
    }
    return <td>{children}</td>;
  };
  
  return (
    <div className="card">
      <h2>🕓 Recent Entries</h2>
      <p className="subtle-text">Click on a row to see full details.</p>
      <div className="table-container">
        <table id="logTable">
          <thead>
            <tr>
              <th>Date</th>
              <th>Log</th>
              <th>Clarity</th>
              <th>Immune</th>
              <th>Physical</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="6" className="subtle-text">Loading entries...</td></tr>
            ) : logs.length > 0 ? (
              logs.map(log => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</td>
                  <td>{log.log}</td>
                  <Td color={log.clarity_color}>{log.clarity_label}</Td>
                  <Td color={log.immune_color}>{log.immune_label}</Td>
                  <Td color={log.physical_readiness_color}>{log.physical_readiness_label}</Td>
                  <td>{log.ai_notes}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="6" className="subtle-text">No entries found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RecentEntries;