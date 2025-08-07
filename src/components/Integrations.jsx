import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

function Integrations() {
    // We now use two state variables. `isConnected` tracks the real database state,
    // and `isChecked` controls the immediate visual state of the toggle.
    const [isConnected, setIsConnected] = useState(false);
    const [isChecked, setIsChecked] = useState(false); 
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

        const { data, error: checkError } = await supabase
            .from('user_integrations')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('provider', 'google-health')
            .maybeSingle();

        if (checkError) {
            setError('Could not verify integration status.');
            setIsConnected(false);
            setIsChecked(false);
        } else if (data) {
            setIsConnected(true);
            setIsChecked(true);
            fetchSteps(session.access_token);
        } else {
            setIsConnected(false);
            setIsChecked(false);
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
    
    // This new useEffect handles the redirect AFTER the state has changed
    useEffect(() => {
        // If the toggle is checked but we aren't actually connected yet, redirect.
        if (isChecked && !isConnected) {
            window.location.href = '/.netlify/functions/google-auth';
        }
    }, [isChecked, isConnected]);

    const handleToggle = async (e) => {
        const isNowChecked = e.target.checked;
        setIsChecked(isNowChecked); // This updates the UI immediately

        if (!isNowChecked) {
            // Disconnect logic remains the same
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
                setIsChecked(true); // Revert UI on failure
            }
            setIsLoading(false);
        }
    };
    
    return (
        <div className="card">
            <h2>Connected Services</h2>
            <div className="integration-row">
                <div className="integration-label">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="google-logo">
                        <title id="google-logo">Google G Logo</title>
                        <path d="M17.64 9.20455C17.64 8.56682 17.5827 7.95273 17.4764 7.36364H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.5609V15.8195H14.9564C16.6582 14.2527 17.64 11.9455 17.64 9.20455Z" fill="#4285F4"/>
                        <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5609C11.2418 14.1018 10.2109 14.4205 9 14.4205C6.96273 14.4205 5.22091 13.0177 4.63455 11.1805H1.61636V13.5091C3.10636 16.2491 5.82727 18 9 18Z" fill="#34A853"/>
                        <path d="M4.63455 11.1805C4.42636 10.5664 4.30909 9.90409 4.30909 9.20455C4.30909 8.505 4.42636 7.84273 4.63455 7.22864V4.89909H1.61636C0.978182 6.13773 0.6 7.62591 0.6 9.20455C0.6 10.7832 0.978182 12.2714 1.61636 13.5091L4.63455 11.1805Z" fill="#FBBC05"/>
                        <path d="M9 3.98864C10.3209 3.98864 11.5077 4.45591 12.4782 5.385L15.0218 2.84045C13.4673 1.37818 11.43 0.409091 9 0.409091C5.82727 0.409091 3.10636 2.15909 1.61636 4.90091L4.63455 7.22864C5.22091 5.39182 6.96273 3.98864 9 3.98864Z" fill="#EA4335"/>
                    </svg>
                    <span>Google Health</span>
                </div>
                <label className="toggle-switch">
                    {/* The input now uses the local `isChecked` state */}
                    <input type="checkbox" checked={isChecked} onChange={handleToggle} disabled={isLoading} />
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