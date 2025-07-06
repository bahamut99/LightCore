const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    try {
        // More robustly check for the authorization header and token
        if (!event.headers.authorization || !event.headers.authorization.startsWith('Bearer ')) {
            throw new Error('Not authorized: Missing or invalid authorization header.');
        }
        const token = event.headers.authorization.split(' ')[1];

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        
        // Authenticate the user with the token
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        
        if (userError || !user) {
            console.error('User auth error:', userError);
            throw new Error('User not found or token invalid.');
        }

        const { log, sleep_hours, sleep_quality } = JSON.parse(event.body);

        let healthDataString = "";
        try {
            const healthResponse = await fetch('https://lightcorehealth.netlify.app/.netlify/functions/fetch-health-data', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (healthResponse.ok) {
                const data = await healthResponse.json();
                if (data && data.steps !== null && data.steps !== undefined) {
                    healthDataString = `\n---\nAutomated Health Data:\n- Today's Step Count: ${data.steps}\n---`;
                }
            }
        } catch (e) {
            console.error("Non-critical error fetching health data:", e.message);
        }
        
        const persona = `You are a holistic health coach with a kind and empathetic "bedside manner."`;
        const prompt = `Based on the user's daily log, provide a JSON object with a root key 'analysis'. This object must contain three keys: 'clarity', 'immune', and 'physical'. Each of these keys should map to an object containing: a 'score' from 1-10, the corresponding 'label' from the rubric (Critical, Poor, Moderate, Good, Optimal), and a 'color_hex' code for that label's color (Critical: #ef4444, Poor: #f97316, Moderate: #eab308, Good: #22c55e, Optimal: #3b82f6). Also include a top-level 'notes' key with your empathetic analysis (2-3 sentences max).

User's Written Log: "${log}"
${healthDataString}`;

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
        const analysis = JSON.parse(aiData.candidates[0].content.parts[0].text).analysis;

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
            ai_notes: analysis.notes,
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