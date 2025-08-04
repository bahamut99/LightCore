import React, { useRef } from 'react';

function WeeklySummary({ isLoading, data }) {
  const cardRef = useRef(null);

  const renderContent = () => {
    if (isLoading) return <div className="loader" style={{margin: '1rem auto'}}></div>;
    
    // Weekly Review logic would go here if we were to integrate it
    // For now, focusing on goal progress
    
    if (data && data.goal) {
        let dots = [];
        for (let i = 0; i < data.goal.goal_value; i++) {
            dots.push(<div key={i} className={`progress-dot ${i < data.progress ? 'completed' : ''}`}></div>);
        }
        return (
            <>
                <h2>🎯 Weekly Progress</h2>
                <p>Logged {data.progress} / {data.goal.goal_value} days this week</p>
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