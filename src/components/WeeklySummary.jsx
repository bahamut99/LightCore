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

    const currentWeek = getCurrentWeekNumber();
    const lastDismissedWeek = localStorage.getItem('lastReviewDismissedWeek');
    const shouldShowReview = String(currentWeek) !== lastDismissedWeek;
    
    try {
      const [goalRes, reviewRes] = await Promise.all([
        fetch('/.netlify/functions/get-goal-progress', { headers: { 'Authorization': `Bearer ${session.access_token}` } }),
        shouldShowReview ? fetch('/.netlify/functions/get-weekly-review', { headers: { 'Authorization': `Bearer ${session.access_token}` } }) : Promise.resolve(null)
      ]);

      const goalData = await goalRes.json();
      if (goalData && goalData.goal) {
        setGoal(goalData.goal);
        setProgress(goalData.progress);
      } else {
        setGoal(null);
      }

      if (reviewRes && reviewRes.ok) {
        const reviewData = await reviewRes.json();
        if (reviewData && reviewData.review) {
          setReview(reviewData.review);
          setShowReview(true);
          setTimeout(() => {
            cardRef.current?.classList.add('highlight-new-content');
          }, 100);
          setTimeout(() => {
            cardRef.current?.classList.remove('highlight-new-content');
          }, 2600);
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

  const renderContent = () => {
    if (isLoading) return <div className="loader" style={{margin: '1rem auto'}}></div>;
    
    if (showReview && review) {
      return (
        <div className="review-content">
            <button onClick={handleDismiss} className="modal-close-btn">&times;</button>
            <h2>{review.headline || "Your Weekly Review"}</h2>
            <p style={{fontSize: '0.9rem', lineHeight: '1.6'}}>{review.narrative || "No summary available."}</p>
            <div className="notes-section" style={{borderTop: '1px solid #374151', marginTop: '1rem', paddingTop: '1rem'}}>
                <span className="label">Key Takeaway:</span>
                <p>{review.key_takeaway}</p>
            </div>
        </div>
      );
    }

    if (goal) {
        let dots = [];
        for (let i = 0; i < goal.goal_value; i++) {
            dots.push(<div key={i} className={`progress-dot ${i < progress ? 'completed' : ''}`}></div>);
        }
        return (
            <>
                <h2>🎯 Weekly Progress</h2>
                <p>Logged {progress} / {goal.goal_value} days this week</p>
                <div className="progress-dots">{dots}</div>
            </>
        );
    }

    return (
        <>
            <h2>🎯 Weekly Progress</h2>
            <p className="subtle-text">No weekly goal set.</p>
        </>
    );
  };

  return (
    <div className="card" id="weekly-summary-card" ref={cardRef}>
      {renderContent()}
    </div>
  );
}

export default WeeklySummary;