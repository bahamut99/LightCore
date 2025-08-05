import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

function Goals() {
    const [currentGoal, setCurrentGoal] = useState(null);
    const [progress, setProgress] = useState(0);
    const [viewMode, setViewMode] = useState('loading'); // loading, view, edit
    const [newValue, setNewValue] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    const fetchGoalData = useCallback(async () => {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            setIsLoading(false);
            // Handle not logged in state if necessary, e.g., redirect
            return;
        }

        try {
            const response = await fetch('/.netlify/functions/get-goal-progress', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await response.json();
            
            if (data && data.goal) {
                setCurrentGoal(data.goal);
                setProgress(data.progress);
                setNewValue(data.goal.goal_value);
                setViewMode('view');
            } else {
                setViewMode('edit');
            }
        } catch (error) {
            console.error("Error fetching goal data:", error);
            setMessage('Could not load your current goal data.');
            setViewMode('edit'); // Default to edit mode on error
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchGoalData();
    }, [fetchGoalData]);
    
    const [isLoading, setIsLoading] = useState(true);

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
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ goal_type: 'log_frequency', goal_value: goalValue })
            });

            if (!response.ok) throw new Error('Failed to save goal.');
            
            const savedGoal = await response.json();
            setCurrentGoal(savedGoal);
            // Progress doesn't change on save, so we keep the existing value
            setMessage('Your new goal has been activated!');
            setViewMode('view');
            setTimeout(() => setMessage(''), 3000);

        } catch (error) {
            console.error("Error saving goal:", error);
            setMessage('An error occurred while saving. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAdjustGoal = () => {
        setViewMode('edit');
        setMessage('');
    };

    const renderDots = () => {
        if (!currentGoal) return null;
        let dots = [];
        for (let i = 0; i < currentGoal.goal_value; i++) {
            dots.push(<div key={i} className={`progress-dot ${i < progress ? 'completed' : ''}`}></div>);
        }
        return dots;
    };

    const renderContent = () => {
        if (viewMode === 'loading') {
            return <div className="loader"></div>;
        }

        if (viewMode === 'view' && currentGoal) {
            return (
                <div className="view-mode-container">
                    <h2>Weekly Goal Activated</h2>
                    <p className="goal-display">Your target is to log <strong>{currentGoal.goal_value}</strong> days per week.</p>
                    <div className="progress-dots">{renderDots()}</div>
                    <p className="progress-text">Current Progress: {progress} / {currentGoal.goal_value} days</p>
                    <button onClick={handleAdjustGoal} className="button-secondary adjust-goal-btn">
                        Adjust Goal
                    </button>
                </div>
            );
        }

        return (
            <form onSubmit={handleSave}>
                <label htmlFor="goal-input">My weekly goal is to log at least:</label>
                <div className="input-group">
                    <input
                        id="goal-input" type="number" min="1" max="7"
                        value={newValue} onChange={(e) => setNewValue(e.target.value)}
                        placeholder="e.g., 5"
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
                <h2>{viewMode === 'view' ? 'Your Active Goal' : 'Set Your Weekly Logging Target'}</h2>
                <p>
                    {viewMode !== 'view' && 'Consistency is key to building a useful Bio Digital Twin. Set a realistic target for how many days you aim to log each week.'}
                </p>
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