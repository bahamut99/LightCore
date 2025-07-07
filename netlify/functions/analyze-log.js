const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Helper function to ensure every field has a safe default value.
function ensureField(field) {
    const defaultValue = { score: 0, label: 'N/A', color_hex: '#6B7280' };
    if (!field) return defaultValue;
    return {
        score: field.score ?? defaultValue.score,
        label: field.label ?? defaultValue.label,
        color_hex: field.color_hex ?? defaultValue.color_hex
    };
}

exports.handler = async (event, context) => {
    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Not authorized: No token.');

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) throw new Error(userError?.message || 'User not found or token invalid.');

        const { log, sleep_hours, sleep_quality } = JSON.parse(event.body);

        let healthDataString = "Not available";
        // This try/catch is for a non-critical feature, so we let it fail silently if needed.
        try {
            const healthResponse = await fetch('https://lightcorehealth.netlify.app/.netlify/functions/fetch-health-data', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (healthResponse.ok) {
                const data = await healthResponse.json();
                if (data && data.steps !== null && data.steps !== undefined) {
                    healthDataString = `- Today's Step Count: ${data.steps}`;
                }
            }
        } catch (e) {
            console.error("Non-critical error fetching health data:", e.message);
        }
        
        // A "bulletproof" prompt that is extremely explicit about the desired output.
        const prompt = `
        You are an AI health analyst. Your response MUST be a single, valid JSON object and nothing else. Do not include conversational text or markdown formatting.
        The JSON object must contain four top-level keys: "clarity", "immune", "physical", and "notes".
        - Each of the "clarity", "immune", and "physical" keys must map to a valid JSON object containing: a "score" (integer 1-10), a "label" (string from the rubric), and a "color_hex" (string).
        - The "notes" key must be a string of empathetic coaching advice (2-3 sentences max) addressed directly to the user as "you".

        Scoring Rubric:
        - 1-2: Critical (#ef4444)
        - 3-4: Poor (#f97316)
        - 5-6: Moderate (#eab308)
        - 7-8: Good (#22c55e)
        - 9-10: Optimal (#3b82f6)

        Analyze the following data to generate the JSON response:
        ---
        User Log: "${log}"
        Automated Health Data: ${healthDataString}
        ---
        `;

        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const aiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`Gemini API error: ${aiResponse.status} ${errorBody}`);
        }

        const aiData = await aiResponse.json();
        
        // More robust parsing and validation
        if (!aiData?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error("AI returned an empty or invalid response structure.");
        }
        const analysis = JSON.parse(aiData.candidates[0].content.parts[0].text);

        // Ensure every field and sub-field is valid before creating the log entry
        const clarity = ensureField(analysis.clarity);
        const immune = ensureField(analysis.immune);
        const physical = ensureField(analysis.physical);

        const logEntry = {
            user_id: user.id,
            log: log,
            clarity_score: clarity.score,
            clarity_label: clarity.label,
            clarity_color: clarity.color_hex,
            immune_score: immune.score,
            immune_label: immune.label,
            immune_color: immune.color_hex,
            physical_readiness_score: physical.score,
            physical_readiness_label: physical.label,
            physical_readiness_color: physical.color_hex,
            ai_notes: analysis.notes || "No specific notes generated.",
        };
        
        if (sleep_hours !== null && !isNaN(sleep_hours)) logEntry.sleep_hours = sleep_hours;
        if (sleep_quality !== null && !isNaN(sleep_quality)) logEntry.sleep_quality = sleep_quality;

        const { data: newLogData, error: dbError } = await supabase
            .from('daily_logs')
            .insert(logEntry)
            .select()
            .single();

        if (dbError) throw new Error(`Supabase insert error: ${dbError.message}`);

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