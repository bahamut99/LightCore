import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ChronoDeck = ({ currentDate }) => {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEventsForDay = async () => {
      setIsLoading(true);
      setError(null);
      setEvents([]);

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) throw new Error("Not authenticated");

        const token = session.access_token;
        
        // This is the correct endpoint for fetching pre-parsed event data.
        const response = await fetch(`/.netlify/functions/get-events`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const allEvents = await response.json();
        const formattedCurrentDate = currentDate.toISOString().split('T')[0];

        // Filter all recent events to show only those matching the selected dashboard date.
        const filteredEvents = allEvents.filter(event => {
            const eventDate = new Date(event.event_time).toISOString().split('T')[0];
            return eventDate === formattedCurrentDate;
        });
        
        // Sort the filtered events by time to ensure they appear chronologically on the timeline.
        const sortedEvents = filteredEvents.sort((a, b) => {
            return new Date(a.event_time) - new Date(b.event_time);
        });
        
        // Format the event data into a structure that's easy for our new component to render.
        const displayEvents = sortedEvents.map(event => {
            const eventConfig = {
                'Workout': '🏋️', 'Meal': '🍽️', 'Snack': ' snacking', 'Caffeine': '☕', 
                'Sleep': '😴', 'Nap': '💤', 'Meditation': '🧘'
            };
            return {
                ...event,
                time: new Date(event.event_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute:'2-digit' }),
                description: `${eventConfig[event.event_type] || '🗓️'} ${event.event_type}`
            };
        });
        
        setEvents(displayEvents);

      } catch (err) {
        console.error("Error fetching ChronoDeck events:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEventsForDay();
  }, [currentDate]);

  const renderContent = () => {
    if (isLoading) {
      return <div className="chrono-deck-message">Initializing ChronoDeck...</div>;
    }
    if (error) {
      return <div className="chrono-deck-message error">Error: {error}</div>;
    }
    if (events.length === 0) {
      return <div className="chrono-deck-message">No timed events logged for this date.</div>;
    }
    return (
      <div className="timeline-container">
        <div className="timeline-line"></div>
        {events.map((event, index) => (
          <div key={index} className={`timeline-item ${index % 2 === 0 ? 'left' : 'right'}`}>
            <div className="timeline-dot"></div>
            <div className="timeline-content">
              <span className="timeline-time">{event.time}</span>
              <p>{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="card" id="chronodeck-card">
        <div className="card-header">
            <h2>🕰️ ChronoDeck</h2>
        </div>
        <div className="chrono-deck-wrapper">
            {renderContent()}
        </div>
    </div>
  );
};

export default ChronoDeck;