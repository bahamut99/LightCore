import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

function WeeklyProgress() {
  const [goal, setGoal] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGoalProgress = useCallback(async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setIsLoading(false); return; }
    
    try {
      const response = await fetch('/.netlify/functions/get-goal-progress', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await response.json();
      if (data && data.goal) {
        setGoal(data.goal);
        setProgress(data.progress);
      } else {
        setGoal(null); // Explicitly set to null if no goal is found
      }
    } catch (error) { console.error("Error fetching goal progress:", error); } 
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    fetchGoalProgress();
    window.addEventListener('newLogSubmitted', fetchGoalProgress);
    return () => window.removeEventListener('newLogSubmitted', fetchGoalProgress);
  }, [fetchGoalProgress]);

  const renderProgressDots = () => {
    if (!goal) return null;
    let dots = [];
    for (let i = 0; i < goal.goal_value; i++) {
      dots.push(<div key={i} className={`progress-dot ${i < progress ? 'completed' : ''}`}></div>);
    }
    return <div className="progress-dots">{dots}</div>;
  };

  return (
    <div className="card" id="goal-progress-card">
      <h2>🎯 Weekly Progress</h2>
      <div id="goal-progress-container">
        {isLoading ? (
          <div className="loader" style={{margin: '1rem auto'}}></div>
        ) : goal ? (
          <>
            <p>Logged {progress} / {goal.goal_value} days this week</p>
            {renderProgressDots()}
          </>
        ) : (
          <p className="subtle-text">No weekly goal set.</p>
        )}
      </div>
    </div>
  );
}

export default WeeklyProgress;