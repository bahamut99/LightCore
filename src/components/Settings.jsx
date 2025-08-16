import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

function Settings() {
    const [preferredUi, setPreferredUi] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState('');

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch('/.netlify/functions/get-user-settings', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (!response.ok) throw new Error('Could not load settings.');
            
            const settings = await response.json();
            setPreferredUi(settings.preferred_ui || 'neural');
        } catch (error) {
            console.error('Error fetching settings:', error);
            setMessage('Error loading your settings.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const handlePreferenceChange = async (newPreference) => {
        setPreferredUi(newPreference);
        setMessage('Saving...');

        const { data: { session } } = await supabase.auth.getSession();
        try {
            const response = await fetch('/.netlify/functions/set-user-settings', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ settings: { preferred_ui: newPreference } })
            });

            if (!response.ok) throw new Error('Failed to save preference.');
            
            setMessage('Preference saved!');
            setTimeout(() => setMessage(''), 2000);
        } catch (error) {
            console.error('Error saving settings:', error);
            setMessage('Error saving. Please try again.');
        }
    };

    return (
        <div className="container">
            <header className="page-header">
                <img src="https://i.imgur.com/d5N9dkk.png" alt="LightCore Logo" className="logo" />
                <h1>Settings</h1>
            </header>
            <section className="card">
                <h2>Dashboard Preference</h2>
                <p>Choose your default dashboard experience. You can switch between them at any time.</p>
                
                {isLoading ? (
                    <div className="loader" style={{margin: '2rem auto'}}></div>
                ) : (
                    <div className="preference-options" style={{marginTop: '2rem'}}>
                        <label style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', cursor: 'pointer' }}>
                            <input 
                                type="radio" 
                                name="ui-preference" 
                                value="neural" 
                                checked={preferredUi === 'neural'} 
                                onChange={() => handlePreferenceChange('neural')}
                            />
                            <span style={{ marginLeft: '1rem' }}>
                                <strong style={{ color: 'white', display: 'block' }}>Neural-Cortex</strong>
                                <span style={{ fontSize: '0.9rem', color: '#9CA3AF' }}>The immersive, 3D data visualization experience.</span>
                            </span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input 
                                type="radio" 
                                name="ui-preference" 
                                value="classic" 
                                checked={preferredUi === 'classic'} 
                                onChange={() => handlePreferenceChange('classic')}
                            />
                            <span style={{ marginLeft: '1rem' }}>
                                <strong style={{ color: 'white', display: 'block' }}>LightCore Classic View</strong>
                                <span style={{ fontSize: '0.9rem', color: '#9CA3AF' }}>The original, data-dense card layout.</span>
                            </span>
                        </label>
                    </div>
                )}
                
                {message && <p className="message" style={{marginTop: '2rem'}}>{message}</p>}
            </section>
            <div className="cta-section">
                <a href="/" className="button-secondary">Return to Dashboard</a>
            </div>
        </div>
    );
}

export default Settings;