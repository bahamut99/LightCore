const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Not authorized: No token.');

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) throw new Error(userError?.message || 'User not found or token invalid.');

        const { log, sleep_hours, sleep_quality } = JSON.parse(event.body);

        let healthDataString = "Not available";
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
        
        // --- MODIFIED: Simplified and more direct prompt ---
        const prompt = `
        You are an AI health analyst. Your response MUST be a single, valid JSON object and nothing else. Do not include any conversational text or markdown formatting like \`\`\`json.

        The JSON object must contain four top-level keys: "clarity", "immune", "physical", and "notes".
        - The "clarity", "immune", and "physical" keys must map to objects, each containing: a "score" (integer 1-10), a "label" (string from the rubric), and a "color_hex" (string).
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
                generationConfig: {
                    responseMimeType: "application/json",
                }
            })
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`Gemini API error: ${aiResponse.status} ${errorBody}`);
        }

        const aiData = await aiResponse.json();
        const analysis = JSON.parse(aiData.candidates[0].content.parts[0].text);

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
            .select()
            .single();

        if (dbError) {
            throw new Error(`Supabase insert error: ${dbError.message}`);
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