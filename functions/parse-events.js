const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// NEW EXPANDED FUZZY TIME MAP
const expandedFuzzyMap = {
    "breakfast": "08:00", "lunch": "12:30", "dinner": "19:00",
    "midnight": "00:00", "dead of night": "00:00", "early hours": "01:00",
    "middle of the night": "02:00", "deep night": "02:00",
    "pre-dawn": "04:00", "crack of dawn": "05:00",
    "before sunrise": "05:00", "early morning": "06:00", "sunrise": "06:00",
    "just after sunrise": "07:00", "morning": "08:00",
    "beginning of the workday": "09:00", "mid-morning": "10:00",
    "late morning": "11:00", "almost noon": "11:30",
    "noon": "12:00", "midday": "12:00", "just after lunch": "13:00",
    "early afternoon": "14:00", "afternoon": "15:00",
    "late afternoon": "16:00", "early evening": "17:00",
    "dinnertime": "18:00", "evening": "19:00",
    "after dinner": "20:00", "late evening": "21:00",
    "before bed": "22:30", "late night": "23:00"
};

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

        // NEW, STRICTER AI PROMPT
        const extractionPrompt = `
        You are a precise data extractor. Your task is to analyze a user's log entry and extract timed events. First, think step-by-step in a <reasoning> block about every potential event in the log. Then, provide your final output as a valid JSON array of objects and nothing else.

        **CRITICAL CONTEXT:**
        - The user is in the timezone: "${userTimezone}". All times MUST be interpreted in this local timezone.
        - Today's date for creating timestamps is ${userToday}.
        - Your final output MUST be only the JSON array. Do not include any other text or markdown.

        **TIME EXTRACTION RULES (in order of priority):**
        1.  **Precise Time:** Always look for a specific time (e.g., "8am", "around 3 PM", "14:30"). Use this if available.
        2.  **Fuzzy Time:** If no precise time is found for an event, check if the log contains any of the phrases from the following map. Use its corresponding mapped time: ${JSON.stringify(expandedFuzzyMap)}.

        **EVENT & OUTPUT RULES:**
        - Valid event types are ONLY: 'Workout', 'Meal', 'Snack', 'Caffeine', 'Sleep', 'Nap', 'Meditation'. DO NOT invent other types like 'Rest'.
        - An event MUST have a clear time reference (e.g., "at 3pm", "in the morning") to be extracted. If a valid activity is mentioned with no time, IGNORE IT.
        - A time range (e.g., "workout from 9 to 10am") MUST be extracted as TWO separate events: one for the start time and one for the end time, both with the same \`event_type\`.
        - Each object in the array represents one event and must have "event_type" and "event_time" (a full ISO 8601 timestamp).
        
        **NEGATIVE CONSTRAINTS (What NOT to do):**
        - DO NOT create an event for phrases like 'waking up' or 'getting out of bed'. These mark the end of sleep, they are not new events.
        - Example of what NOT to do: If the log says "woke up at 7am", DO NOT create a 'Sleep' event at 7am.

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