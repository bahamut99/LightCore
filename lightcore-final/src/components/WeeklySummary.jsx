import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient.js';

function WeeklySummary() {
  const [goal, setGoal] = useState(null);
  const [progress, setProgress] = useState(0);
  const [review, setReview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const cardRef = useRef(null);

  const getCurrentWeekNumber = () => {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
    const pastDaysOfYear = (today - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setIsLoading(false); return; }

    // Check if we should show the review
    const currentWeek = getCurrentWeekNumber();
    const lastDismissedWeek = localStorage.getItem('lastReviewDismissedWeek');
    const shouldShowReview = String(currentWeek) !== lastDismissedWeek;
    setShowReview(shouldShowReview);

    try {
      // Fetch both goal progress and weekly review
      const [goalRes, reviewRes] = await Promise.all([
        fetch('/.netlify/functions/get-goal-progress', { headers: { 'Authorization': `Bearer ${session.access_token}` } }),
        shouldShowReview ? fetch('/.netlify/functions/get-weekly-review', { headers: { 'Authorization': `Bearer ${session.access_token}` } }) : Promise.resolve(null)
      ]);

      const goalData = await goalRes.json();
      if (goalData && goalData.goal) {
        setGoal(goalData.goal);
        setProgress(goalData.progress);
      }

      if (reviewRes && reviewRes.ok) {
        const reviewData = await reviewRes.json();
        if (reviewData && reviewData.review) {
          setReview(reviewData.review);
          // Apply highlight animation
          cardRef.current?.classList.add('highlight-new-content');
          setTimeout(() => {
            cardRef.current?.classList.remove('highlight-new-content');
          }, 2500);
        }
      }
    } catch (error) {
      console.error("Error fetching weekly summary:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDismiss = () => {
    const currentWeek = getCurrentWeekNumber();
    localStorage.setItem('lastReviewDismissedWeek', String(currentWeek));
    setShowReview(false);
  };

  const renderProgressDots = () => {
    if (!goal) return null;
    let dots = [];
    for (let i = 0; i < goal.goal_value; i++) {
      dots.push(<div key={i} className={`progress-dot ${i < progress ? 'completed' : ''}`}></div>);
    }
    return <div className="progress-dots">{dots}</div>;
  };

  const renderContent = () => {
    if (isLoading) return <div className="loader" style={{margin: '1rem auto'}}></div>;
    
    // If a review is available and should be shown, render it
    if (showReview && review) {
      return (
        <div>
            <button onClick={handleDismiss} className="modal-close-btn" style={{top: '15px', right: '15px'}}>&times;</button>
            <h4>{review.headline || "Your Weekly Review"}</h4>
            <p style={{fontSize: '0.9rem', lineHeight: '1.6'}}>{review.narrative || "No summary available."}</p>
            <div className="notes-section" style={{borderTop: 'none', paddingTop: 0, marginTop: '1rem'}}>
                <span className="label">Key Takeaway:</span>
                <p>{review.key_takeaway}</p>
            </div>
        </div>
      );
    }

    // Otherwise, fall back to showing goal progress
    if (goal) {
      return (
        <>
          <p>Logged {progress} / {goal.goal_value} days this week</p>
          {renderProgressDots()}
        </>
      );
    }

    return <p className="subtle-text">No weekly goal set.</p>;
  };

  return (
    <div className="card" id="goal-progress-card" ref={cardRef}>
      <h2>🎯 Weekly Progress</h2>
      <div id="goal-progress-container">
        {renderContent()}
      </div>
    </div>
  );
}

export default WeeklySummary;