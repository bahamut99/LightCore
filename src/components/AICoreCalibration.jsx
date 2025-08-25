import React from 'react';

const STAGES = [
  { id: 'signal',   name: 'First Signal Acquired', logsRequired: 1,  icon: '∼' },
  { id: 'pattern',  name: 'Pattern Engine',        logsRequired: 7,  icon: '⬡' },
  { id: 'temporal', name: 'Temporal Drift Map',    logsRequired: 14, icon: '🕒' },
  { id: 'persona',  name: 'Deep Persona Layer',    logsRequired: 30, icon: '🧠' }
];

const LAST_REQUIRED = STAGES[STAGES.length - 1].logsRequired;

export default function AICoreCalibration({ logCount = 0 }) {
  // Clamp to [0, 100] and fill 1/30 per day
  const progressPct = Math.max(0, Math.min(100, (logCount / LAST_REQUIRED) * 100));

  // First stage not yet unlocked (used to style the "active" node)
  const firstLockedIndex = STAGES.findIndex(s => logCount < s.logsRequired);

  return (
    <div className="ai-core-calibration-container">
      <div className="calibration-pathway">
        <div className="pathway-background" />
        <div
          className="pathway-progress"
          style={{ width: `${progressPct}%` }}
        />

        {STAGES.map((stage, idx) => {
          const position = (stage.logsRequired / LAST_REQUIRED) * 100;

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
