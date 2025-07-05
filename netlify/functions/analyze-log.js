const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    try {
        // Authenticate user
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Not authorized: No token.');

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) throw new Error(userError?.message || 'User not found or token invalid.');

        const { log, sleep_hours, sleep_quality } = JSON.parse(event.body);

        // Fetch automated health data
        let objectiveData = {};
        try {
            const healthResponse = await fetch('https://lightcorehealth.netlify.app/.netlify/functions/fetch-health-data', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (healthResponse.ok) {
                const data = await healthResponse.json();
                if (data && data.steps !== null && data.steps !== undefined) {
                    objectiveData.steps = data.steps;
                }
            }
        } catch (e) {
            console.error("Non-critical error fetching health data:", e.message);
        }

        // --- New Gemini Prompt Structure ---
        const geminiPrompt = {
            "userContext": {
                "timeZone": "America/Chicago" // Example, can be made dynamic later
            },
            "subjectiveLog": log,
            "objectiveData": objectiveData,
            "scoringRubric": {
                "1-2": "Critical 🔴",
                "3-4": "Poor 🟠",
                "5-6": "Moderate 🟡",
                "7-8": "Good 🟢",
                "9-10": "Optimal 🔵"
            },
            "instructions": "Analyze the provided subjective log and objective data. Return a JSON object with a root key 'analysis'. This object must contain three keys: 'clarity', 'immune', and 'physical'. Each of these keys should map to an object containing: a 'score' from 1-10, the corresponding 'label' from the rubric, and a 'color_hex' code for that label's color. Also include a top-level 'notes' key with your empathetic analysis (2-3 sentences max)."
        };

        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const aiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: JSON.stringify(geminiPrompt) }] }],
                generationConfig: {
                    response_mime_type: "application/json",
                }
            })
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`Gemini API error: ${aiResponse.status} ${errorBody}`);
        }

        const aiData = await aiResponse.json();
        // The Gemini response is nested differently
        const analysis = aiData.candidates[0].content.parts[0].text.analysis;

        // --- New Log Entry with detailed scores ---
        const logEntry = {
            user_id: user.id,
            log: log,
            // Clarity
            clarity_label: analysis.clarity.label,
            clarity_score: analysis.clarity.score,
            clarity_color: analysis.clarity.color_hex,
            // Immune
            immune_label: analysis.immune.label,
            immune_score: analysis.immune.score,
            immune_color: analysis.immune.color_hex,
            // Physical
            physical_readiness_label: analysis.physical.label,
            physical_readiness_score: analysis.physical.score,
            physical_readiness_color: analysis.physical.color_hex,
            // Notes & Sleep
            ai_notes: analysis.notes,
        };
        
        if (sleep_hours !== null && !isNaN(sleep_hours)) logEntry.sleep_hours = sleep_hours;
        if (sleep_quality !== null && !isNaN(sleep_quality)) logEntry.sleep_quality = sleep_quality;

        const { data: newLogData, error: dbError } = await supabase
            .from('daily_logs')
            .insert(logEntry)
            .select();

        if (dbError) {
            throw new Error(`Supabase insert error: ${dbError.message}`);
        }

        // The front-end still expects the old property names for now. We will update it in the next phase.
        const responseData = { ...newLogData[0] };
        responseData.Clarity = responseData.clarity_label;
        responseData.Immune = responseData.immune_label;
        responseData.PhysicalReadiness = responseData.physical_readiness_label;
        responseData.Notes = responseData.ai_notes;
        responseData.Log = responseData.log;
        
        return {
            statusCode: 200,
            body: JSON.stringify(responseData),
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