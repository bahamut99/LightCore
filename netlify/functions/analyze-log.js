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
        
        const persona = `You are a holistic health coach...`;
        const prompt = `Based on the user's daily log... User's Written Log: "${log}"\n${healthDataString}`;

        // MODIFIED: Using the correct gemini-1.5-flash model
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

        const logEntry = { /* ... same as before ... */ };

        const { data: newLogData, error: dbError } = await supabase.from('daily_logs').insert(logEntry).select().single();
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
module.exports.config = { timeout: 25 };