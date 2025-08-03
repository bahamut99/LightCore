import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

function LightcoreGuide() {
  const [guidance, setGuidance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGuidance = useCallback(async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setIsLoading(false); return; }

    try {
        const response = await fetch('/.netlify/functions/generate-guidance', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) throw new Error("Failed to fetch guidance");
        
        const data = await response.json();
        setGuidance(data.guidance);
    } catch (error) {
        console.error("Failed to load guidance:", error.message);
        setGuidance({ error: "Could not load guidance at this time." });
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGuidance();
    window.addEventListener('newLogSubmitted', fetchGuidance);
    return () => window.removeEventListener('newLogSubmitted', fetchGuidance);
  }, [fetchGuidance]);


  const renderContent = () => {
    if (isLoading) {
        return <div className="loader" style={{margin: '1rem auto'}}></div>;
    }
    if (guidance?.error) {
        return <p className="subtle-text">{guidance.error}</p>;
    }
    if (guidance) {
        return (
            <>
                {guidance.current_state && <p className="current-state">{guidance.current_state}</p>}
                
                {guidance.positives && guidance.positives.length > 0 && (
                    <div className="guidance-section positives">
                        <h4>✅ Positives</h4>
                        <ul>{guidance.positives.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                )}
                {guidance.concerns && guidance.concerns.length > 0 && (
                     <div className="guidance-section concerns">
                        <h4>⚠️ Concerns</h4>
                        <ul>{guidance.concerns.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                )}
                {guidance.suggestions && guidance.suggestions.length > 0 && (
                     <div className="guidance-section suggestions">
                        <h4>🚀 Suggestions</h4>
                        <ul>{guidance.suggestions.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                )}
            </>
        );
    }
    return <p className="subtle-text">Log data for a few days to start generating personalized guidance.</p>;
  };

  return (
    <div className="card card-glass" id="guidance-card">
        <h2>Your Lightcore Guide</h2>
        <div id="guidance-container">
            {renderContent()}
        </div>
        <hr />
        <div className="history-link-container">
            <a href="history.html" className="footer-link">View Full Insights History</a>
        </div>
    </div>
  );
}

export default LightcoreGuide;