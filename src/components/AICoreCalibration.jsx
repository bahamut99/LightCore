import React from 'react';

const STAGES = [
  { id: 'signal', name: 'First Signal Acquired', logsRequired: 1, icon: '∼' },
  { id: 'pattern', name: 'Pattern Engine', logsRequired: 7, icon: '⬡' },
  { id: 'temporal', name: 'Temporal Drift Map', logsRequired: 14, icon: '🕒' },
  { id: 'persona', name: 'Deep Persona Layer', logsRequired: 30, icon: '🧠' }
];

const AICoreCalibration = ({ logCount }) => {

  const getProgressToNextStage = () => {
    if (logCount >= STAGES[STAGES.length - 1].logsRequired) return 100;

    let currentStageIndex = -1;
    for (let i = STAGES.length - 1; i >= 0; i--) {
        if (logCount >= STAGES[i].logsRequired) {
            currentStageIndex = i;
            break;
        }
    }
    
    if (currentStageIndex === -1) return (logCount / STAGES[0].logsRequired) * 100;

    const currentStage = STAGES[currentStageIndex];
    const nextStage = STAGES[currentStageIndex + 1];
    
    const logsIntoCurrentStage = logCount - currentStage.logsRequired;
    const logsNeededForNextStage = nextStage.logsRequired - currentStage.logsRequired;

    return (logsIntoCurrentStage / logsNeededForNextStage) * 100;
  };
  
  const progressPercent = getProgressToNextStage();

  return (
    <div className="ai-core-calibration-container">
      <div className="calibration-pathway">
        <div className="pathway-background"></div>
        <div className="pathway-progress" style={{ height: `${progressPercent}%` }}></div>
        
        {STAGES.map((stage, index) => {
          const isUnlocked = logCount >= stage.logsRequired;
          const isActive = isUnlocked && (!STAGES[index + 1] || logCount < STAGES[index + 1].logsRequired);
          
          let statusClass = 'locked';
          if (isActive) statusClass = 'active';
          else if (isUnlocked) statusClass = 'unlocked';

          return (
            <div key={stage.id} className={`pathway-node ${statusClass}`} title={`${stage.name} (Unlocks at ${stage.logsRequired} logs)`}>
              <div className="node-icon">{stage.icon}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AICoreCalibration;