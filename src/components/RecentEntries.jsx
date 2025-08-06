import React, { useState } from 'react';

const LogDetailModal = ({ log, onClose }) => {
    if (!log) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="modal-close-btn">&times;</button>
                <h3>{new Date(log.created_at).toLocaleString()}</h3>
                <h4>Full Log Entry:</h4>
                <p>{log.log}</p><hr />
                <h4>Sleep Data:</h4>
                <div className="modal-scores">
                    <div><span className="label">Hours Slept:</span><span>{log.sleep_hours || 'N/A'}</span></div>
                    <div><span className="label">Sleep Quality (1-5):</span><span>{log.sleep_quality ? `${log.sleep_quality} / 5` : 'N/A'}</span></div>
                </div><hr />
                <h4>AI Analysis:</h4>
                <div className="modal-scores">
                    <div><span className="label">Mental Clarity:</span><span>{log.clarity_score}/10 ({log.clarity_label})</span></div>
                    <div><span className="label">Immune Risk:</span><span>{log.immune_score}/10 ({log.immune_label})</span></div>
                    <div><span className="label">Physical Output:</span><span>{log.physical_readiness_score}/10 ({log.physical_readiness_label})</span></div>
                </div>
                <h4>AI Notes:</h4>
                <p>{log.ai_notes}</p>
            </div>
        </div>
    );
};

function RecentEntries({ isLoading, data: logs }) {
  const [selectedLog, setSelectedLog] = useState(null);
  
  const TdScore = ({ children, color }) => {
    const style = color ? { color, backgroundColor: `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, 0.1)` } : {};
    return <td><span className="score-bubble" style={style}>{children || 'N/A'}</span></td>;
  };
  
  return (
    <>
      <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      <div className="card">
        <h2>Recent Entries</h2>
        <p className="subtle-text">Click on a row to see full details.</p>
        <div className="table-container">
          <table id="logTable">
            <thead>
              <tr><th>Date</th><th>Log</th><th>Clarity</th><th>Immune</th><th>Physical</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="6" className="subtle-text">Loading entries...</td></tr>
              ) : (logs && logs.length > 0) ? (
                logs.map(log => (
                  <tr key={log.id} onClick={() => setSelectedLog(log)}>
                    <td>{new Date(log.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</td>
                    <td>{log.log}</td>
                    <TdScore color={log.clarity_color}>{log.clarity_label}</TdScore>
                    <TdScore color={log.immune_color}>{log.immune_label}</TdScore>
                    <TdScore color={log.physical_readiness_color}>{log.physical_readiness_label}</TdScore>
                    <td>{log.ai_notes}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" className="subtle-text">No entries found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default RecentEntries;