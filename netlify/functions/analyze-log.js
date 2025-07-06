const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// This helper function creates the Supabase client with the correct auth context
const getSupabase = (token) => {
    if (!token) throw new Error('Not authorized: No token.');
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });
};

// This function calls the Gemini API
const callGemini = async (prompt) => {
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(geminiApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${errorBody}`);
    }
    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
};


exports.handler = async (event, context) => {
    try {
        const token = event.headers.authorization?.split(' ')[1];
        const supabase = getSupabase(token);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not found or token invalid.');

        const { log, sleep_hours, sleep_quality } = JSON.parse(event.body);

        // --- Step 1: Extract timestamped events from the log ---
        const eventExtractionPrompt = `Your task is to act as a data extractor. Read the user's log and identify specific, timestamped events. The only valid event types are 'Workout', 'Meal', 'Caffeine', and 'Sleep'. If you find an event, return a JSON array of objects. Each object must have an "event_type" and an "event_time" (a full ISO 8601 timestamp for today, ${new Date().toISOString().split('T')[0]}). If no specific events are mentioned, return an empty array []. User's Log: "${log}"`;
        const extractedEvents = await callGemini(eventExtractionPrompt);

        // --- Step 2: Main analysis for scores and notes ---
        let healthDataString = ""; // (Health data fetching logic can be added here later)
        const persona = `You are a holistic health coach...`;
        const analysisPrompt = `Analyze the user's log and return a JSON object with... User's Written Log: "${log}"\n${healthDataString}`;
        const analysis = (await callGemini(analysisPrompt)).analysis;

        const defaultScore = { score: 0, label: 'N/A', color_hex: '#6B7280' };
        analysis.clarity = analysis.clarity || defaultScore;
        analysis.immune = analysis.immune || defaultScore;
        analysis.physical = analysis.physical || defaultScore;

        // --- Step 3: Save the main log entry ---
        const logEntry = {
            user_id: user.id,
            log: log,
            clarity_score: analysis.clarity.score,
            clarity_label: analysis.clarity.label,
            clarity_color: analysis.clarity.color_hex,
            immune_score: analysis.immune.score,
            immune_label: analysis.immune.label,
            immune_color: analysis.immune.color_hex,
            physical_readiness_score: analysis.physical.score,
            physical_readiness_label: analysis.physical.label,
            physical_readiness_color: analysis.physical.color_hex,
            ai_notes: analysis.notes || "No specific notes generated.",
        };
        if (sleep_hours !== null && !isNaN(sleep_hours)) logEntry.sleep_hours = sleep_hours;
        if (sleep_quality !== null && !isNaN(sleep_quality)) logEntry.sleep_quality = sleep_quality;

        const { data: newLogData, error: dbError } = await supabase
            .from('daily_logs')
            .insert(logEntry)
            .select('id') // Select only the ID of the new log
            .single();

        if (dbError) throw new Error(`Supabase insert error: ${dbError.message}`);
        
        // --- Step 4: Save the extracted events linked to the new log ---
        if (extractedEvents && extractedEvents.length > 0) {
            const eventsToInsert = extractedEvents.map(event => ({
                user_id: user.id,
                log_id: newLogData.id,
                event_type: event.event_type,
                event_time: event.event_time
            }));
            const { error: eventError } = await supabase.from('events').insert(eventsToInsert);
            if (eventError) console.error("Error saving extracted events:", eventError.message);
        }

        // --- Step 5: Return the full log entry to the UI ---
        const { data: finalLog, error: finalLogError } = await supabase
            .from('daily_logs')
            .select('*')
            .eq('id', newLogData.id)
            .single();
        if (finalLogError) throw new Error(`Error fetching final log: ${finalLogError.message}`);

        return {
            statusCode: 200,
            body: JSON.stringify(finalLog),
        };

    } catch (error) {
        console.error('CRITICAL ERROR in analyze-log:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

module.exports.config = {
  timeout: 25,
};