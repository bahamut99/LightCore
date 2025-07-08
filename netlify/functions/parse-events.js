const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Not authorized.');

        // **FIX**: Initialize the Supabase client with the user's auth token directly.
        // This is a more robust pattern for serverless functions.
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: {
                headers: { Authorization: `Bearer ${token}` }
            }
        });

        // Now we can get the user without passing the token again.
        const { data: { user }, error: userGetError } = await supabase.auth.getUser();
        if (userGetError || !user) throw new Error('User not found or token invalid.');

        const { log_id, log_text } = JSON.parse(event.body);
        if (!log_id || !log_text) throw new Error('Missing log_id or log_text.');

        const today = new Date();
        const extractionPrompt = `Your task is to act as a data extractor. Read the user's log and identify specific, timestamped events. The only valid event types are 'Workout', 'Meal', 'Caffeine', and 'Sleep'. If you find an event, return a JSON array of objects. Each object must have an "event_type" and an "event_time" (a full ISO 8601 timestamp for today, ${today.toISOString().split('T')[0]}). If no events are mentioned, return an empty array []. User's Log: "${log_text}"`;

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
            extractedEvents = JSON.parse(rawText.match(/\[[\s\S]*\]/)[0]);
        } catch (e) {
            console.log("No valid event JSON found in AI response.");
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
                console.error("Error saving extracted events:", eventError.message);
                throw new Error(`Error saving extracted events: ${eventError.message}`);
            }
        }

        return { statusCode: 200, body: 'Event parsing complete.' };

    } catch (error) {
        console.error('CRITICAL ERROR in parse-events:', error.message);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};