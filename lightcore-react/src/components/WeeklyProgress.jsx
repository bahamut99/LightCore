import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient.js'; // Import our client

function WeeklyProgress() {
  // 'useState' creates a "memory" for this component to hold data.
  const [goal, setGoal] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // 'useEffect' runs code once when the component first appears.
  // We use it to fetch data from our Netlify function.
  useEffect(() => {
    async function fetchGoalProgress() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('/.netlify/functions/get-goal-progress', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await response.json();
        if (data && data.goal) {
          setGoal(data.goal);
          setProgress(data.progress);
        }
      } catch (error) {
        console.error("Error fetching goal progress:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchGoalProgress();
  }, []); // The empty array [] means this effect runs only once.

  // This function creates the progress dots UI
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
          <p className="subtle-text">Loading progress...</p>
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