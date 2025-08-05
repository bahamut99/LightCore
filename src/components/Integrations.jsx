import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

function Integrations() {
    const [isConnected, setIsConnected] = useState(false);
    const [stepCount, setStepCount] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const checkIntegrationStatus = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            setIsLoading(false);
            return;
        }

        // Check if a token exists for this user and provider
        const { data, error: checkError } = await supabase
            .from('user_integrations')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('provider', 'google-health')
            .maybeSingle();

        if (checkError) {
            setError('Could not verify integration status.');
            setIsConnected(false);
        } else if (data) {
            setIsConnected(true);
            fetchSteps(session.access_token);
        } else {
            setIsConnected(false);
        }
        setIsLoading(false);
    }, []);

    const fetchSteps = async (token) => {
        try {
            const response = await fetch('/.netlify/functions/fetch-health-data', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to fetch step data.');
            
            const data = await response.json();
            setStepCount(data.steps);
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => {
        checkIntegrationStatus();
    }, [checkIntegrationStatus]);

    const handleToggle = async (e) => {
        if (e.target.checked) {
            // Toggling ON: Redirect to the Google Auth function
            window.location.href = '/.netlify/functions/google-auth';
        } else {
            // Toggling OFF: Call our new delete function
            setIsLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            try {
                await fetch('/.netlify/functions/delete-integration', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ provider: 'google-health' })
                });
                setIsConnected(false);
                setStepCount(null);
            } catch (err) {
                setError("Failed to disconnect.");
            }
            setIsLoading(false);
        }
    };
    
    return (
        <div className="card">
            <h2>🔗 Connected Services</h2>
            <div className="integration-row">
                <span>Google Health</span>
                <label className="toggle-switch">
                    <input type="checkbox" checked={isConnected} onChange={handleToggle} disabled={isLoading} />
                    <span className="slider"></span>
                </label>
            </div>
            {isConnected && (
                <div className="integration-data">
                    <hr />
                    {isLoading && !stepCount ? (
                        <div className="loader" style={{margin: '1rem auto'}}></div>
                    ) : error ? (
                         <p className="error-message small">{error}</p>
                    ) : (
                        <div className="step-count-display">
                            <span className="steps">{stepCount !== null ? stepCount.toLocaleString() : '...'}</span>
                            <span className="label">Steps Today</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default Integrations;