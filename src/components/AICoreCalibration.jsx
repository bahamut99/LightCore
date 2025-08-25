import React from 'react';

// Original staged unlock thresholds (days/logs)
const STAGES = [
  { id: 'signal',   name: 'First Signal Acquired', logsRequired: 1,  icon: '∼' },
  { id: 'pattern',  name: 'Pattern Engine',        logsRequired: 7,  icon: '⬡' },
  { id: 'temporal', name: 'Temporal Drift Map',    logsRequired: 14, icon: '🕒' },
  { id: 'persona',  name: 'Deep Persona Layer',    logsRequired: 30, icon: '🧠' },
];

// Map a raw logCount onto the 0–100% bar using the stage breakpoints
function stagePercent(logCount) {
  const last = STAGES[STAGES.length - 1].logsRequired;
  if (!logCount || logCount <= 0) return 0;
  if (logCount >= last) return 100;

  // Piecewise-linear between stage anchors (not purely linear to 30)
  let prevReq = 0;
  let prevPct = 0;

  for (let i = 0; i < STAGES.length; i++) {
    const req = STAGES[i].logsRequired;
    const pct = (req / last) * 100; // anchor along the track

    if (logCount < req) {
      const seg = (logCount - prevReq) / Math.max(1, (req - prevReq));
      return Math.max(0, Math.min(100, prevPct + seg * (pct - prevPct)));
    }

    prevReq = req;
    prevPct = pct;
  }
  return Math.max(0, Math.min(100, prevPct));
}

export default function AICoreCalibration({ logCount = 0 }) {
  const progressPct = stagePercent(logCount);

  // Determine node statuses
  const firstLockedIndex = STAGES.findIndex(s => logCount < s.logsRequired);

  return (
    <div className="ai-core-calibration-container">
      <div className="calibration-pathway">
        <div className="pathway-background" />
        <div className="pathway-progress" style={{ width: `${progressPct}%` }} />

        {STAGES.map((stage, idx) => {
          const position = (stage.logsRequired / STAGES[STAGES.length - 1].logsRequired) * 100;

          let statusClass = 'locked';
          if (logCount >= stage.logsRequired) statusClass = 'unlocked';
          else if (idx === firstLockedIndex || firstLockedIndex === -1) statusClass = 'active';

          return (
            <div
              key={stage.id}
              className={`pathway-node ${statusClass}`}
              style={{ left: `${position}%` }}
              title={`${stage.name} (Unlocks at ${stage.logsRequired} logs)`}
            >
              <div className="node-icon">{stage.icon}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
