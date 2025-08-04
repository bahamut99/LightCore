const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Not authorized.');

        const { log_id, log_text, userTimezone } = JSON.parse(event.body);
        if (!log_id || !log_text || !userTimezone) {
            throw new Error('Missing log_id, log_text, or userTimezone.');
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: {
                headers: { Authorization: `Bearer ${token}` }
            }
        });

        const { data: { user }, error: userGetError } = await supabase.auth.getUser();
        if (userGetError || !user) throw new Error('User not found or token invalid.');
        
        const userToday = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone });

        const fuzzyMap = {
            "breakfast": "08:00", "lunch": "12:30", "dinner": "19:00",
            "early morning": "06:00", "morning": "09:00", "late morning": "11:00",
            "noon": "12:00", "afternoon": "14:00", "early afternoon": "13:00",
            "late afternoon": "17:00", "evening": "19:00", "late evening": "21:00",
            "before bed": "22:30"
        };

        const extractionPrompt = `
        You are a precise data extractor. Your task is to analyze a user's log entry and extract timed events. First, think step-by-step in a <reasoning> block about every potential event in the log. Then, provide your final output as a valid JSON array of objects.

        **IMPORTANT CONTEXT:**
        - The user is in the timezone: "${userTimezone}". All times MUST be interpreted in this local timezone.
        - Today's date for creating timestamps is ${userToday}.
        - Your final output MUST be only the JSON array. Do not include any other text or markdown.
        - Each object in the array represents one event and must have "event_type" and "event_time" (a full ISO 8601 timestamp).
        - For a time range (e.g., "from 10:30am to noon"), you MUST create two separate events with the same "event_type": one for the start time and one for the end time.

        **TIME EXTRACTION RULES (in order of priority):**
        1.  **Precise Time:** Always look for a specific time (e.g., "8am", "around 3 PM", "14:30"). Use this if available.
        2.  **Fuzzy Time:** If no precise time is found for an event, check if the log contains any of these phrases: ${Object.keys(fuzzyMap).join(', ')}. Use its corresponding mapped time: ${JSON.stringify(fuzzyMap)}.
        3.  If an event is mentioned but has NO time associated with it, DO NOT create an event for it.

        **EVENT RULES:**
        - Valid event types are: 'Workout', 'Meal', 'Snack', 'Caffeine', 'Sleep', 'Nap', 'Meditation'.
        - A "Meal" is a significant eating event like breakfast, lunch, or dinner.
        - A "Snack" is a smaller eating event.
        - "Strength training" or specific exercises like "squats" count as a 'Workout'.
        - A "Nap" is a short sleep period during the day. 'Sleep' is for the main overnight period.

        User Log: "${log_text}"
        `;

        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const aiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: extractionPrompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!aiResponse.ok) throw new Error('Gemini event extraction failed.');

        const aiData = await aiResponse.json();
        const rawText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) return { statusCode: 200, body: 'No events found.'};

        let extractedEvents;
        try {
            const jsonMatch = rawText.match(/(\[[\s\S]*\])/);
            if (!jsonMatch) throw new Error("No valid JSON array found in AI response.");
            extractedEvents = JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.log("Could not parse event JSON from AI response.");
            return { statusCode: 200, body: 'No valid event array found.'};
        }

        if (extractedEvents && extractedEvents.length > 0) {
            const eventsToInsert = extractedEvents.map(e => ({
                user_id: user.id,
                log_id: log_id,
                event_type: e.event_type,
                event_time: e.event_time
            }));
            const { error: eventError } = await supabase.from('events').insert(eventsToInsert);
            if (eventError) {
                throw new Error(`Error saving extracted events: ${eventError.message}`);
            }
        }

        return { statusCode: 200, body: 'Event parsing complete.' };

    } catch (error) {
        console.error('CRITICAL ERROR in parse-events:', error.message);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};