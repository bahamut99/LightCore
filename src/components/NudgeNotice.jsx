import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

// Self-contained Modal Component
const NudgeModal = ({ nudge, onClose }) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="modal-close-btn">&times;</button>
                <h3>{nudge.headline}</h3>
                <p>{nudge.body_text}</p>
                <hr />
                <h4>Suggested Actions:</h4>
                <ul className="suggested-actions-list">
                    {nudge.suggested_actions.map((action, index) => (
                        <li key={index}>{action}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

function NudgeNotice() {
    const [nudge, setNudge] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAcknowledged, setIsAcknowledged] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);

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
    
    const handleAcknowledge = async () => {
        if (!nudge) return;

        const { data: { session } } = await supabase.auth.getSession();
        try {
            await fetch('/.netlify/functions/acknowledge-nudge', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}` 
                },
                body: JSON.stringify({ nudgeId: nudge.id })
            });
        } catch (error) {
            console.error("Failed to acknowledge nudge:", error);
        } finally {
            // Hide the component from the UI immediately
            setIsAcknowledged(true);
            setIsModalOpen(false);
            setShowFeedback(false);
        }
    };

    const handleDismissClick = () => {
        setShowFeedback(true);
    };

    if (isLoading || !nudge || isAcknowledged) {
        return null;
    }

    return (
        <>
            <div className="card nudge-card">
                {!showFeedback ? (
                    <>
                        <h3>Sentinel Sync Notice</h3>
                        <p>{nudge.headline}</p>
                        <div className="nudge-actions">
                            <button className="nudge-btn-details" onClick={() => setIsModalOpen(true)}>View Details</button>
                            <button className="nudge-btn-dismiss" onClick={handleDismissClick}>Dismiss</button>
                        </div>
                    </>
                ) : (
                    <div className="feedback-prompt">
                        <p>Was this insight helpful?</p>
                        <div className="nudge-actions">
                            <button className="nudge-btn-details" onClick={handleAcknowledge}>👍 Yes</button>
                            <button className="nudge-btn-dismiss" onClick={handleAcknowledge}>👎 No</button>
                        </div>
                    </div>
                )}
            </div>

            {isModalOpen && <NudgeModal nudge={nudge} onClose={handleAcknowledge} />}
        </>
    );
}

export default NudgeNotice;