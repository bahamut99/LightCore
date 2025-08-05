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
        d.setHours(0, 0, 0, 0); // Start at the beginning of the day
        d.setDate(d.getDate() - i);
        days.push(d);
    }
    return days;
};

const hourMarkers = [
    { label: '12A', position: 0 },
    { label: '6A', position: 25 },
    { label: '12P', position: 50 },
    { label: '6P', position: 75 },
    { label: '12A', position: 100 }
];

// Helper to get a consistent, local date key (e.g., "2025-7-4")
const getLocalDateKey = (date) => {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

// Rewritten function to be more robust
function processEventsIntoTracks(dailyEvents) {
    const topTrack = [];
    const bottomTrack = [];

    const eventsWithTimes = dailyEvents
        .map(event => {
            const config = EVENT_CONFIG[event.event_type] || { duration: 30 };
            const startTime = new Date(event.event_time).getTime();
            const endTime = startTime + config.duration * 60000;
            return { ...event, startTime, endTime };
        })
        .sort((a, b) => a.startTime - b.startTime);

    for (const event of eventsWithTimes) {
        const lastInTop = topTrack[topTrack.length - 1];
        if (!lastInTop || event.startTime >= lastInTop.endTime) {
            topTrack.push(event);
            continue;
        }
        
        const lastInBottom = bottomTrack[bottomTrack.length - 1];
        if (!lastInBottom || event.startTime >= lastInBottom.endTime) {
            bottomTrack.push(event);
            continue;
        }

        // For a 3+ overlap, this gracefully places the third event on top of the first,
        // which is better than breaking.
        topTrack.push(event);
    }
    return { topTrack, bottomTrack };
}

function ChronoDeck({ isLoading, data: eventsData }) {
    
    const today = new Date();

    const processEventsForView = (events) => {
        const sevenDays = getLastSevenDays();
        const eventsByDay = {};

        // Use a local date key to initialize the map
        sevenDays.forEach(day => {
            eventsByDay[getLocalDateKey(day)] = [];
        });

        if (events) {
            events.forEach(event => {
                // All date operations are now done in the user's local timezone
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

            const { topTrack, bottomTrack } = processEventsIntoTracks(eventsByDay[dayKey]);
            const hasOverlap = bottomTrack.length > 0;

            const createBlock = (event) => {
                const config = EVENT_CONFIG[event.event_type] || { duration: 30 };
                const startTime = new Date(event.event_time);
                const startOfDay = new Date(startTime);
                startOfDay.setHours(0, 0, 0, 0);
                const minutesFromStartOfDay = (startTime - startOfDay) / 60000;
                const startPercent = (minutesFromStartOfDay / 1440) * 100;
                const widthPercent = (config.duration / 1440) * 100;
                const timeString = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                return {
                    id: event.event_time + event.event_type,
                    type: event.event_type,
                    timeString: timeString,
                    style: { left: `${startPercent}%`, width: `${widthPercent}%`, backgroundColor: config.color }
                };
            };

            return { 
                dayName, 
                dateString: dayKey,
                isToday,
                hasOverlap,
                topTrackEvents: topTrack.map(createBlock),
                bottomTrackEvents: bottomTrack.map(createBlock)
            };
        });
    };

    const weeklyData = processEventsForView(eventsData);

    return (
        <div className="card" id="chronodeck-card">
            <div className="card-header">
                <h2>🕰️ ChronoDeck</h2>
            </div>
            {isLoading ? (
                <div className="loader" style={{ margin: '3rem auto' }}></div>
            ) : (
                <>
                    <div className="chrono-deck-weekly-view">
                        {weeklyData.map(day => (
                            <div className="day-row" key={day.dateString}>
                                <div className="day-label">{day.dayName}</div>
                                <div className={`timeline-bar-container ${day.hasOverlap ? 'has-overlap' : ''}`}>
                                    <div className={`timeline-bar-base ${day.isToday ? 'is-today' : ''}`}></div>
                                    {day.topTrackEvents.map(event => (
                                        <div 
                                            key={event.id}
                                            className={`event-block ${day.hasOverlap ? 'track-top' : 'track-full'}`}
                                            style={event.style}
                                            title={`${event.type} at ${event.timeString}`}
                                        ></div>
                                    ))}
                                    {day.bottomTrackEvents.map(event => (
                                        <div 
                                            key={event.id}
                                            className="event-block track-bottom"
                                            style={event.style}
                                            title={`${event.type} at ${event.timeString}`}
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
                </>
            )}
        </div>
    );
}

export default ChronoDeck;