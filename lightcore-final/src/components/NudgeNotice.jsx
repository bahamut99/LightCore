import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

function NudgeNotice() {
    const [nudge, setNudge] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchNudge = useCallback(async () => {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            setIsLoading(false);
            return;
        }
        try {
            const response = await fetch('/.netlify/functions/get-nudges', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setNudge(data);
            }
        } catch (error) {
            console.error("Error fetching nudge:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNudge();
    }, [fetchNudge]);

    // Render nothing if it's loading or if there is no nudge to display
    if (isLoading || !nudge) {
        return null;
    }

    // If a nudge is found, render the notice card
    return (
        <div className="card nudge-card">
            <h3>Sentinel Sync Notice</h3>
            <p>{nudge.headline}</p>
            <div className="nudge-actions">
                <button className="nudge-btn-details">View Details</button>
                <button className="nudge-btn-dismiss">Dismiss</button>
            </div>
        </div>
    );
}

export default NudgeNotice;