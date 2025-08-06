import React, { useRef } from 'react';

function WeeklySummary({ isLoading, data }) {
  const cardRef = useRef(null);

  const renderContent = () => {
    if (isLoading) return <div className="loader" style={{margin: '1rem auto'}}></div>;
    
    if (data && data.goal) {
        let dots = [];
        for (let i = 0; i < data.goal.goal_value; i++) {
            dots.push(<div key={i} className={`progress-dot ${i < data.progress ? 'completed' : ''}`}></div>);
        }
        return (
            <>
                <h2>Weekly Progress</h2>
                <p>Logged {data.progress} / {data.goal.goal_value} days this week</p>
                <div className="progress-dots">{dots}</div>
            </>
        );
    }

    return (
        <>
            <h2>Weekly Progress</h2>
            <p className="subtle-text">No weekly goal set.</p>
        </>
    );
  };

  return (
    <div className="card" id="weekly-summary-card" ref={cardRef}>
      {renderContent()}
      <hr />
      <div className="manage-goal-link-container">
          <a href="goals.html" className="button-set-goal">Set Goal</a>
      </div>
    </div>
  );
}

export default WeeklySummary;