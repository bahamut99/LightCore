const { createClient } = require('@supabase/supabase-js');

// Helper to call the Gemini API
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
    const rawText = data.candidates[0].content.parts[0].text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/); // Match object or array
    if (!jsonMatch) return null; // Return null if no JSON is found
    return JSON.parse(jsonMatch[0]);
};

exports.handler = async (event, context) => {
    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Not authorized: No token.');

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) throw new Error(userError?.message || 'User not found or token invalid.');

        const { log, sleep_hours, sleep_quality } = JSON.parse(event.body);

        // --- Step 1: Main analysis for scores and notes ---
        const analysisPrompt = `Analyze the user's log...`; // Using the final prompt from our previous step
        const analysis = await callGemini(analysisPrompt);
        
        const defaultScore = { score: 0, label: 'N/A', color_hex: '#6B7280' };
        analysis.clarity = analysis.clarity || defaultScore;
        analysis.immune = analysis.immune || defaultScore;
        analysis.physical = analysis.physical || defaultScore;

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
            .select('id, clarity_score, clarity_label, immune_score, immune_label, physical_readiness_score, physical_readiness_label, ai_notes')
            .single();

        if (dbError) throw new Error(`Supabase insert error: ${dbError.message}`);

        // --- Step 2: Extract timestamped events from the log ---
        const eventExtractionPrompt = `Your task is to act as a data extractor... User's Log: "${log}"`;
        const extractedEvents = await callGemini(eventExtractionPrompt);

        if (extractedEvents && extractedEvents.length > 0) {
            const eventsToInsert = extractedEvents.map(e => ({
                user_id: user.id,
                log_id: newLogData.id,
                event_type: e.event_type,
                event_time: e.event_time
            }));
            const { error: eventError } = await supabase.from('events').insert(eventsToInsert);
            if (eventError) console.error("Error saving extracted events:", eventError.message);
        }

        return {
            statusCode: 200,
            body: JSON.stringify(newLogData),
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