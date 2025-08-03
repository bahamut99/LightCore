import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

function Goals() {
    const [currentGoal, setCurrentGoal] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [newValue, setNewValue] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    const fetchGoal = useCallback(async () => {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch('/.netlify/functions/get-goals', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await response.json();
            if (data) {
                setCurrentGoal(data);
                setNewValue(data.goal_value);
            }
        } catch (error) {
            console.error("Error fetching goal:", error);
            setMessage('Could not load your current goal.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchGoal();
    }, [fetchGoal]);

    const handleSave = async (e) => {
        e.preventDefault();
        const goalValue = parseInt(newValue, 10);
        if (isNaN(goalValue) || goalValue < 1 || goalValue > 7) {
            setMessage('Please enter a valid number between 1 and 7.');
            return;
        }
        
        setIsSaving(true);
        setMessage('');
        const { data: { session } } = await supabase.auth.getSession();

        try {
            const response = await fetch('/.netlify/functions/set-goal', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}` 
                },
                body: JSON.stringify({
                    goal_type: 'log_frequency',
                    goal_value: goalValue
                })
            });

            if (!response.ok) throw new Error('Failed to save goal.');
            
            const savedGoal = await response.json();
            setCurrentGoal(savedGoal);
            setMessage('Your new goal has been saved successfully!');
            setTimeout(() => setMessage(''), 3000);

        } catch (error) {
            console.error("Error saving goal:", error);
            setMessage('An error occurred while saving. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const renderContent = () => {
        if (isLoading) {
            return <div className="loader"></div>;
        }

        return (
            <form onSubmit={handleSave}>
                <label htmlFor="goal-input">My weekly goal is to log at least:</label>
                <div className="input-group">
                    <input
                        id="goal-input"
                        type="number"
                        min="1"
                        max="7"
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder={currentGoal ? currentGoal.goal_value : 'e.g., 5'}
                    />
                    <span>days per week</span>
                </div>
                <button type="submit" disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Goal'}
                </button>
            </form>
        );
    };

    return (
        <div className="container">
            <header className="page-header">
                <img src="https://i.imgur.com/d5N9dkk.png" alt="LightCore Logo" className="logo" />
                <h1>My Goals</h1>
            </header>
            <section className="card">
                <h2>Set Your Weekly Logging Target</h2>
                <p>Consistency is key to building a useful Bio Digital Twin. Set a realistic target for how many days you aim to log each week.</p>
                {renderContent()}
                {message && <p className="message">{message}</p>}
            </section>
             <div className="cta-section">
                <a href="/" className="button-secondary">Return to Dashboard</a>
            </div>
        </div>
    );
}

export default Goals;