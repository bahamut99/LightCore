import React, { useState } from 'react';

// The modal component to show log details
const LogDetailModal = ({ log, onClose }) => {
    if (!log) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="modal-close-btn">&times;</button>
                <h3>Log for {new Date(log.created_at).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                <hr />
                <p>{log.log}</p>
                <hr />
                <div className="modal-scores">
                    <span><strong>Clarity:</strong> {log.clarity_score}/10 ({log.clarity_label})</span>
                    <span><strong>Immune:</strong> {log.immune_score}/10 ({log.immune_label})</span>
                    <span><strong>Physical:</strong> {log.physical_readiness_score}/10 ({log.physical_readiness_label})</span>
                    <span><strong>Sleep:</strong> {log.sleep_hours !== null ? `${log.sleep_hours} hrs` : 'N/A'} (Quality: {log.sleep_quality || 'N/A'}/5)</span>
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