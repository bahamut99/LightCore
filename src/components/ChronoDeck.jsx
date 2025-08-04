import React from 'react';

const EVENT_CONFIG = {
    'Workout':    { color: '#38bdf8', duration: 60, icon: '🏋️' },
    'Meal':       { color: '#facc15', duration: 30, icon: '🍽️' },
    'Snack':      { color: '#fde047', duration: 15, icon: ' snacking' },
    'Caffeine':   { color: '#f97316', duration: 10, icon: '☕' },
    'Sleep':      { color: '#a78bfa', duration: 480, icon: '😴' }, // Default 8 hours, will be start of day
    'Nap':        { color: '#c4b5fd', duration: 30, icon: '💤' },
    'Meditation': { color: '#818cf8', duration: 20, icon: '🧘' }
};

// Helper to get the last 7 days, ending with today
const getLastSevenDays = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d);
    }
    return days;
};

function ChronoDeck({ isLoading, data: eventsData }) {
    
    const processEventsForView = (events) => {
        const sevenDays = getLastSevenDays();
        const eventsByDay = {};

        // Initialize with empty arrays for each of the last 7 days
        sevenDays.forEach(day => {
            const dayString = day.toISOString().split('T')[0];
            eventsByDay[dayString] = [];
        });

        // Group events into their respective days
        if (events) {
            events.forEach(event => {
                const eventDate = new Date(event.event_time);
                const dayString = eventDate.toISOString().split('T')[0];
                if (dayString in eventsByDay) {
                    eventsByDay[dayString].push(event);
                }
            });
        }
        
        // Map over the days to create the final structure for rendering
        return sevenDays.map(day => {
            const dayString = day.toISOString().split('T')[0];
            const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
            
            const processedEvents = eventsByDay[dayString].map(event => {
                const config = EVENT_CONFIG[event.event_type] || { color: '#6B7280', duration: 30, icon: '🗓️' };
                const startTime = new Date(event.event_time);
                
                const startOfDay = new Date(startTime);
                startOfDay.setHours(0, 0, 0, 0);

                const minutesFromStartOfDay = (startTime - startOfDay) / 60000;
                
                const startPercent = (minutesFromStartOfDay / 1440) * 100; // 1440 minutes in a day
                const widthPercent = (config.duration / 1440) * 100;

                const timeString = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                return {
                    id: event.event_time, // Use timestamp as a unique key
                    type: event.event_type,
                    timeString: timeString,
                    icon: config.icon,
                    style: {
                        left: `${startPercent}%`,
                        width: `${widthPercent}%`,
                        backgroundColor: config.color
                    }
                };
            });

            return { dayName, dateString: dayString, events: processedEvents };
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
                <div className="chrono-deck-weekly-view">
                    {weeklyData.map(day => (
                        <div className="day-row" key={day.dateString}>
                            <div className="day-label">{day.dayName}</div>
                            <div className="timeline-bar-container">
                                <div className="timeline-bar-base"></div>
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
            )}
        </div>
    );
}

export default ChronoDeck;