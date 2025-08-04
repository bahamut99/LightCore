import React from 'react';

const EVENT_CONFIG = {
    'Workout':    { color: '#38bdf8', duration: 60, icon: '🏋️' },
    'Meal':       { color: '#facc15', duration: 30, icon: '🍽️' },
    'Snack':      { color: '#fde047', duration: 15, icon: ' snacking' },
    'Caffeine':   { color: '#f97316', duration: 10, icon: '☕' },
    'Sleep':      { color: '#a78bfa', duration: 480, icon: '😴' },
    'Nap':        { color: '#c4b5fd', duration: 30, icon: '💤' },
    'Meditation': { color: '#818cf8', duration: 20, icon: '🧘' }
};

const getLastSevenDays = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d);
    }
    return days;
};

// New, more precise set of hour markers for the timeline
const hourMarkers = [
    { label: '12A', position: 0 },
    { label: '6A', position: 25 },
    { label: '12P', position: 50 },
    { label: '6P', position: 75 },
    { label: '12A', position: 100 }
];

function ChronoDeck({ isLoading, data: eventsData }) {
    
    const today = new Date();

    const processEventsForView = (events) => {
        const sevenDays = getLastSevenDays();
        const eventsByDay = {};

        sevenDays.forEach(day => {
            const dayString = day.toISOString().split('T')[0];
            eventsByDay[dayString] = [];
        });

        if (events) {
            events.forEach(event => {
                const eventDate = new Date(event.event_time);
                const dayString = eventDate.toISOString().split('T')[0];
                if (dayString in eventsByDay) {
                    eventsByDay[dayString].push(event);
                }
            });
        }
        
        return sevenDays.map(day => {
            const dayString = day.toISOString().split('T')[0];
            const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
            
            const isToday = day.getFullYear() === today.getFullYear() &&
                          day.getMonth() === today.getMonth() &&
                          day.getDate() === today.getDate();

            const processedEvents = eventsByDay[dayString].map(event => {
                const config = EVENT_CONFIG[event.event_type] || { color: '#6B7280', duration: 30, icon: '🗓️' };
                const startTime = new Date(event.event_time);
                
                const startOfDay = new Date(startTime);
                startOfDay.setHours(0, 0, 0, 0);

                const minutesFromStartOfDay = (startTime - startOfDay) / 60000;
                
                const startPercent = (minutesFromStartOfDay / 1440) * 100;
                const widthPercent = (config.duration / 1440) * 100;

                const timeString = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                return {
                    id: event.event_time,
                    type: event.event_type,
                    timeString: timeString,
                    style: {
                        left: `${startPercent}%`,
                        width: `${widthPercent}%`,
                        backgroundColor: config.color
                    }
                };
            });

            return { dayName, dateString: dayString, events: processedEvents, isToday };
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
                                <div className="timeline-bar-container">
                                    <div className={`timeline-bar-base ${day.isToday ? 'is-today' : ''}`}></div>
                                    {day.events.map(event => (
                                        <div 
                                            key={event.id}
                                            className="event-block"
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