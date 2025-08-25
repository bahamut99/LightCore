import React from 'react';

const EVENT_CONFIG = {
    'Workout':    { color: '#38bdf8', duration: 60 },
    'Meal':       { color: '#facc15', duration: 30 },
    'Snack':      { color: '#fde047', duration: 15 },
    'Caffeine':   { color: '#f97316', duration: 10 },
    'Sleep':      { color: '#a78bfa', duration: 480 },
    'Nap':        { color: '#c4b5fd', duration: 30 },
    'Meditation': { color: '#818cf8', duration: 20 }
};

const getLastSevenDays = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        days.push(d);
    }
    return days;
};

const hourMarkers = [
    { label: '12A', position: 0 },
    { label: '6A', position: 25 },
    { label: '12P', position: 50 },
    { label: '6P', position: 75 }
];

const getLocalDateKey = (date) => {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/* =========================
   Minimal Sleep/Nap NLP (no deps)
   ========================= */

// Extract any text field we might have on the event
function extractEventText(e) {
  return (
    e.raw_text ||
    e.note ||
    e.notes ||
    e.description ||
    e.event_text ||
    e.text ||
    ''
  ).toString();
}

// Time tokens: "8am", "7:45pm", "23:10", "noon", "midnight"
const TIME_RE =
  /(?:(?<noon>noon)|(?<midnight>midnight)|(?<h>\d{1,2})(?::(?<m>\d{2}))?\s*(?<ampm>am|pm)?)/i;

// Durations: "8 hours", "8h", "7.5h", "7h 30m", "90m", "45 minutes", "1h20m"
const DUR_RE =
  /(?:(?<h>\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(?<hm>\d+)\s*m(?:in(?:utes?)?)?)|(?:(?<h2>\d+(?:\.\d+)?)\s*h(?:ours?)?)|(?:(?<m>\d+)\s*m(?:in(?:utes?)?)?)/i;

function parseTimeToken(str, refDate, bias /* 'wake' | 'bed' */) {
  if (!str) return null;
  const m = String(str).match(TIME_RE);
  if (!m) return null;
  const g = m.groups || {};
  const base = new Date(refDate);
  const d = new Date(base);
  let hour = 0, min = 0;

  if (g.noon) { hour = 12; min = 0; }
  else if (g.midnight) { hour = 0; min = 0; }
  else {
    hour = Number(g.h || 0);
    min = Number(g.m || 0);
    const ampm = g.ampm ? g.ampm.toLowerCase() : null;

    if (ampm === 'am') {
      if (hour === 12) hour = 0;
    } else if (ampm === 'pm') {
      if (hour !== 12) hour += 12;
    } else {
      // Heuristic if am/pm omitted:
      // If 'wake', prefer AM for 1..11; if 'bed', prefer PM for 1..11.
      if (hour >= 1 && hour <= 11) {
        if (bias === 'bed') hour += 12;
      }
    }
  }

  d.setHours(hour, min, 0, 0);
  return d;
}

function parseDurationToken(str) {
  if (!str) return null;
  const m = String(str).match(DUR_RE);
  if (!m) return null;
  const g = m.groups || {};
  let minutes = 0;

  if (g.h && g.hm) {
    minutes = Math.round(Number(g.h) * 60 + Number(g.hm));
  } else if (g.h2) {
    minutes = Math.round(Number(g.h2) * 60);
  } else if (g.m) {
    minutes = Number(g.m);
  }
  return minutes > 0 ? minutes : null;
}

// Patterns we care about
const P_WAKE_AFTER = /woke(?:\s+back\s*up|\s+up)?\s+(?:at\s+)?(?<t>[^,.;]*?)\s+(?:after|following)\s+(?<dur>[^,.;]*?)\s+(?:of\s+)?(?:sleep|rest)\b/i;
const P_SLEPT_RANGE = /slept(?:\s+from)?\s+(?<t1>[^,.;]*?)\s*(?:-|–|to|until)\s*(?<t2>[^,.;]*?)\b/i;
const P_BED_UP     = /(bed(?:time)?|in\s+bed)\s+(?:at\s+)?(?<t1>[^,.;]*?)[,;]?\s+(?:up|wake(?:d)?|woke|awake)\s+(?:at\s+)?(?<t2>[^,.;]*?)\b/i;
const P_NAP_AT     = /nap(?:ped)?\s+(?<dur>[^,.;]*?)\s+(?:at\s+)?(?<t>[^,.;]*?)\b/i;
const P_NAP_RANGE  = /nap(?:ped)?\s+(?<t1>[^,.;]*?)\s*(?:-|–|to|until)\s*(?<t2>[^,.;]*?)\b/i;
const P_SLEPT_ONLY_DUR = /slept\s+(?<dur>[^,.;]*?)\b/i;

/**
 * Given an event and its config, try to infer start/end for Sleep/Nap
 * from any attached natural-language text. Falls back to default duration.
 * Returns { startTime, endTime } in ms.
 */
function inferStartEndFromText(event, config) {
  const anchor = new Date(event.event_time); // use event_time's calendar day as ref
  const text = extractEventText(event);
  const type = (event.event_type || '').toLowerCase();

  // Only handle Sleep/Nap here
  if (type !== 'sleep' && type !== 'nap') {
    const start = anchor.getTime();
    const end = start + (config?.duration || 30) * 60000;
    return { startTime: start, endTime: end };
  }

  const minutesCap = type === 'nap' ? 240 : 24 * 60;

  // 1) "woke up at 8am after 8 hours sleep"  => end at 8am, start = end - 8h
  const mWake = text.match(P_WAKE_AFTER);
  if (mWake?.groups) {
    const t = parseTimeToken(mWake.groups.t, anchor, 'wake');
    const dur = parseDurationToken(mWake.groups.dur);
    if (t && dur) {
      const end = t.getTime();
      const start = end - Math.min(dur, minutesCap) * 60000;
      return { startTime: start, endTime: end };
    }
  }

  // 2) "slept 12:30am–7:45am"
  const mRange = text.match(P_SLEPT_RANGE);
  if (mRange?.groups) {
    const t1 = parseTimeToken(mRange.groups.t1, anchor, 'bed');
    const t2 = parseTimeToken(mRange.groups.t2, anchor, 'wake');
    if (t1 && t2) {
      let start = t1.getTime();
      let end = t2.getTime();
      if (end <= start) end += 24 * 60 * 60000; // crossed midnight
      // Cap duration sensibly
      if ((end - start) / 60000 > minutesCap) end = start + minutesCap * 60000;
      return { startTime: start, endTime: end };
    }
  }

  // 3) "bed at 11:15pm, up at 7:05am"
  const mBedUp = text.match(P_BED_UP);
  if (mBedUp?.groups) {
    const t1 = parseTimeToken(mBedUp.groups.t1, anchor, 'bed');
    const t2 = parseTimeToken(mBedUp.groups.t2, anchor, 'wake');
    if (t1 && t2) {
      let start = t1.getTime();
      let end = t2.getTime();
      if (end <= start) end += 24 * 60 * 60000;
      if ((end - start) / 60000 > minutesCap) end = start + minutesCap * 60000;
      return { startTime: start, endTime: end };
    }
  }

  // 4) "napped 45m at 3pm"
  if (type === 'nap') {
    const mNapAt = text.match(P_NAP_AT);
    if (mNapAt?.groups) {
      const t = parseTimeToken(mNapAt.groups.t, anchor, 'wake');
      const dur = parseDurationToken(mNapAt.groups.dur);
      if (t && dur) {
        const end = t.getTime();
        const start = end - Math.min(dur, minutesCap) * 60000;
        return { startTime: start, endTime: end };
      }
    }
    // 5) "nap 2:10–2:50pm"
    const mNapRange = text.match(P_NAP_RANGE);
    if (mNapRange?.groups) {
      const t1 = parseTimeToken(mNapRange.groups.t1, anchor, 'bed');
      const t2 = parseTimeToken(mNapRange.groups.t2, anchor, 'wake');
      if (t1 && t2) {
        let start = t1.getTime();
        let end = t2.getTime();
        if (end <= start) end += 24 * 60 * 60000;
        if ((end - start) / 60000 > minutesCap) end = start + minutesCap * 60000;
        return { startTime: start, endTime: end };
      }
    }
  }

  // 6) "slept 7h 30m" (no times) — anchor end to a wake mention if present; else event_time
  const mDurOnly = text.match(P_SLEPT_ONLY_DUR);
  if (mDurOnly?.groups) {
    const dur = parseDurationToken(mDurOnly.groups.dur);
    if (dur) {
      // If there's a "woke at ..." anywhere, use that as end
      const wakeTimeMention = /woke|wake(?:d)?\s+(?:up\s+)?(?:at\s+)?(?<t>[^,.;]*?)(?:\b|$)/i.exec(text);
      let endDate = null;
      if (wakeTimeMention?.groups?.t) {
        const parsed = parseTimeToken(wakeTimeMention.groups.t, anchor, 'wake');
        if (parsed) endDate = parsed;
      }
      const end = (endDate ? endDate.getTime() : new Date(event.event_time).getTime());
      const start = end - Math.min(dur, minutesCap) * 60000;
      return { startTime: start, endTime: end };
    }
  }

  // Fallback to your fixed bar width from config
  const startFallback = anchor.getTime();
  const endFallback = startFallback + (config?.duration || 30) * 60000;
  return { startTime: startFallback, endTime: endFallback };
}

function layoutEventsForDay(dailyEvents) {
    if (!dailyEvents || dailyEvents.length === 0) {
        return [];
    }

    const eventsWithTimes = dailyEvents
        .map(event => {
            const config = EVENT_CONFIG[event.event_type] || { duration: 30 };

            // *** Only change: infer Sleep/Nap timing from text when available ***
            const { startTime, endTime } = inferStartEndFromText(event, config);

            return { ...event, startTime, endTime, track: 0, hasOverlap: false };
        })
        .sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < eventsWithTimes.length; i++) {
        for (let j = i + 1; j < eventsWithTimes.length; j++) {
            const eventA = eventsWithTimes[i];
            const eventB = eventsWithTimes[j];

            if (eventA.endTime > eventB.startTime) {
                eventA.hasOverlap = true;
                eventB.hasOverlap = true;
                if (eventA.track === eventB.track) {
                    eventB.track = eventA.track + 1;
                }
            }
        }
    }

    return eventsWithTimes;
}

function ChronoDeck({ isLoading, data: eventsData }) {
    const today = new Date();

    const processEventsForView = (events) => {
        const sevenDays = getLastSevenDays();
        const eventsByDay = {};

        sevenDays.forEach(day => {
            eventsByDay[getLocalDateKey(day)] = [];
        });

        if (events) {
            events.forEach(event => {
                const eventDate = new Date(event.event_time);
                const eventKey = getLocalDateKey(eventDate);
                if (eventKey in eventsByDay) {
                    eventsByDay[eventKey].push(event);
                }
            });
        }
        
        return sevenDays.map(day => {
            const dayKey = getLocalDateKey(day);
            const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
            
            const isToday = getLocalDateKey(day) === getLocalDateKey(today);

            const laidOutEvents = layoutEventsForDay(eventsByDay[dayKey]);
            const dayHasOverlap = laidOutEvents.some(e => e.hasOverlap);

            const processedBlocks = laidOutEvents.map(event => {
                const config = EVENT_CONFIG[event.event_type] || { duration: 30 };
                const startTime = new Date(event.startTime);
                const startOfDay = new Date(startTime);
                startOfDay.setHours(0, 0, 0, 0);
                const minutesFromStartOfDay = (startTime - startOfDay) / 60000;
                const widthMinutes = (event.endTime - event.startTime) / 60000 || config.duration;
                const startPercent = (minutesFromStartOfDay / 1440) * 100;
                const widthPercent = (widthMinutes / 1440) * 100;
                const timeString = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                let trackClass = 'track-full';
                if (event.hasOverlap) {
                    trackClass = event.track === 0 ? 'track-top' : 'track-bottom';
                }

                return {
                    id: event.event_time + event.event_type,
                    type: event.event_type,
                    timeString: timeString,
                    className: `event-block ${trackClass}`,
                    style: { left: `${startPercent}%`, width: `${widthPercent}%`, backgroundColor: config.color }
                };
            });

            return { 
                dayName, 
                dateString: dayKey,
                isToday,
                hasOverlap: dayHasOverlap,
                blocks: processedBlocks
            };
        });
    };

    const weeklyData = processEventsForView(eventsData);

    return (
        <div className="card" id="chronodeck-card">
            <h2>ChronoDeck</h2>
            <div className="chrono-deck-weekly-view">
                {weeklyData.map(day => (
                    <div className="day-row" key={day.dateString}>
                        <div className="day-label">{day.dayName}</div>
                        <div className={`timeline-bar-container ${day.hasOverlap ? 'has-overlap' : ''}`}>
                            <div className={`timeline-bar-base ${day.isToday ? 'is-today' : ''}`}></div>
                            {day.blocks.map(block => (
                                <div 
                                    key={block.id}
                                    className={block.className}
                                    style={block.style}
                                    title={`${block.type} at ${block.timeString}`}
                                ></div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="hour-marker-track">
                <div className="hour-marker-spacer"></div>
                <div className="hour-markers">
                    {hourMarkers.map(marker => (
                        <span key={marker.label + marker.position} style={{ left: `${marker.position}%` }}>
                            {marker.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default ChronoDeck;
