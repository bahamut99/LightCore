import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

async function fetchWithRetry(url, options, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if ([502, 503, 504].includes(response.status)) {
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            return response;
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error(`Failed to fetch after ${retries} attempts.`);
}

function LightcoreGuide() {
  const [guidance, setGuidance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGuidance = useCallback(async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        setIsLoading(false);
        return;
    }
    try {
        const response = await fetchWithRetry('/.netlify/functions/generate-guidance', {
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
        return <p className="subtle-text">Generating your personalized guidance...</p>;
    }
    if (guidance?.error) {
        return <p className="error-message">{guidance.error}</p>;
    }
    if (guidance) {
        return (
            <>
                {guidance.current_state && <p className="current-state">{guidance.current_state}</p>}
                
                {guidance.positives && (
                    <div className="guidance-section positives">
                        <h4>✅ Positives</h4>
                        <ul>{guidance.positives.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                )}
                {guidance.concerns && (
                     <div className="guidance-section concerns">
                        <h4>⚠️ Concerns</h4>
                        <ul>{guidance.concerns.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                )}
                {guidance.suggestions && (
                     <div className="guidance-section suggestions">
                        <h4>🚀 Suggestions</h4>
                        <ul>{guidance.suggestions.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                )}
            </>
        );
    }
    return null;
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