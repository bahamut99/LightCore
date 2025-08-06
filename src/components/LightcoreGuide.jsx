import React from 'react';
import AICoreCalibration from './AICoreCalibration.jsx';

function LightcoreGuide({ isLoading, data: guidance, logCount }) {

  const renderContent = () => {
    if (isLoading) {
        return <div className="loader" style={{margin: '1rem auto'}}></div>;
    }
    if (guidance?.error) {
        return <p className="subtle-text">{guidance.error}</p>;
    }
    if (guidance && guidance.current_state) {
        return (
            <>
                {guidance.current_state && <p className="current-state">{guidance.current_state}</p>}
                
                {guidance.positives && guidance.positives.length > 0 && (
                    <div className="guidance-section positives">
                        <h4>✅ Positives</h4>
                        <ul>{guidance.positives.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                )}
                {guidance.concerns && guidance.concerns.length > 0 && (
                    <div className="guidance-section concerns">
                        <h4>⚠️ Concerns</h4>
                        <ul>{guidance.concerns.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                )}
                {guidance.suggestions && guidance.suggestions.length > 0 && (
                    <div className="guidance-section suggestions">
                        <h4>🚀 Suggestions</h4>
                        <ul>{guidance.suggestions.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                )}
            </>
        );
    }
    // Default message when there are no logs yet.
    return <p className="subtle-text">Log your first entry to begin AI calibration.</p>;
  };

  return (
    <div className="card card-glass" id="guidance-card">
      <h2>Lightcore Guide</h2>

      <div id="guidance-container">
          {renderContent()}
      </div>
      
      {/* The Calibration component has been moved here to act as a separator */}
      <AICoreCalibration logCount={logCount} />
      
      <div className="history-link-container">
          <a href="history.html" className="footer-link">View Insight History</a>
      </div>
    </div>
  );
}

export default LightcoreGuide;