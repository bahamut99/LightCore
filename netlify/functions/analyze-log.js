const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Helper to create an admin client to bypass RLS for context updates
const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
        if (!event.headers.authorization) {
            throw new Error('Not authorized. No auth header.');
        }
        const token = event.headers.authorization.split(' ')[1];
        
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
            throw new Error('User not found or token invalid.');
        }

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
        
        const prompt = `
        You are an AI health analyst. Your response MUST be a single, valid JSON object and nothing else. Do not include any conversational text or markdown formatting.

        The JSON object must contain four top-level keys: "clarity", "immune", "physical", and "notes".
        - The "clarity", "immune", and "physical" keys must map to objects, each containing: a "score" (integer 1-10), a "label" (string), and a "color_hex" (string).
        - The "notes" key must be a string of empathetic coaching advice (2-3 sentences max) addressed directly to the user ("you").

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
        
        let analysis;
        try {
            const rawText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) {
                throw new Error("AI returned an empty or invalid response structure.");
            }
            analysis = JSON.parse(rawText);
        } catch (parseError) {
            console.error("Failed to parse JSON from AI response:", parseError);
            throw new Error("Failed to parse AI response.");
        }

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
            sleep_hours: sleep_hours || null,
            sleep_quality: sleep_quality || null
        };
        
        const { data: newLogData, error: dbError } = await supabase
            .from('daily_logs')
            .insert(logEntry)
            .select()
            .single();

        if (dbError) {
            throw new Error(`Supabase insert error: ${dbError.message}`);
        }
        
        // --- NEW: Update AI Memory Context ---
        const supabaseAdmin = createAdminClient();
        const { data: recentLogs, error: logFetchError } = await supabaseAdmin
            .from('daily_logs')
            .select('created_at, log, clarity_score, immune_score, physical_readiness_score, sleep_hours, sleep_quality')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(30);

        if (logFetchError) {
            console.error("Error fetching recent logs for context update:", logFetchError.message);
        } else {
            await supabaseAdmin
                .from('lightcore_brain_context')
                .upsert({
                    user_id: user.id,
                    recent_logs: recentLogs,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
        }
        // --- End of new logic ---

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