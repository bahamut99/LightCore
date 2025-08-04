import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient.js';

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

function NudgeNotice({ data: nudge, onAcknowledge }) {
    const [isVisible, setIsVisible] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);

    useEffect(() => {
        if (nudge) {
            setIsVisible(true);
        } else {
            setIsVisible(false);
        }
    }, [nudge]);
    
    const handleAcknowledge = async () => {
        if (!nudge) return;
        setIsVisible(false); // Hide immediately for better UX

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
            onAcknowledge(); // Trigger a data refresh in the parent
        } catch (error) {
            console.error("Failed to acknowledge nudge:", error);
            setIsVisible(true); // If API call fails, show it again
        }
    };

    const handleDismissClick = () => {
        setShowFeedback(true);
    };

    if (!isVisible) {
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

            {isModalOpen && <NudgeModal nudge={nudge} onClose={() => setIsModalOpen(false)} />}
        </>
    );
}

export default NudgeNotice;