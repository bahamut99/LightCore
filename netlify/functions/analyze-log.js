const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // --- Get the logged-in user's details ---
    const cookieHeader = event.headers.cookie || '';
    const user_jwt = cookieHeader.split('; ').find(c => c.startsWith('nf_jwt='))?.split('=')[1];
    if (!user_jwt) return { statusCode: 401, body: 'Not authorized.' };
    
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${user_jwt}` } }
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { statusCode: 401, body: 'User not found.' };

    const { log, sleep_hours, sleep_quality } = JSON.parse(event.body);

    let healthDataString = "";
    try {
        // --- Call our new function to get health data ---
        const healthResponse = await fetch('https://lightcorehealth.netlify.app/.netlify/functions/fetch-health-data', {
            headers: { 'Cookie': event.headers.cookie }
        });
        if (healthResponse.ok) {
            const data = await healthResponse.json();
            if (data.steps !== null) {
                healthDataString = `
---
Automated Health Data:
- Today's Step Count: ${data.steps}
---
`;
            }
        }
    } catch (e) {
        console.error("Could not fetch health data:", e.message);
    }
    
    const persona = `You are a holistic health coach with a kind and empathetic "bedside manner." Your goal is to provide a user with a simple, clear, and actionable analysis of their daily log.`;

    const prompt = `Based on the user's daily log, provide a JSON object with scores for "Clarity" (mental), "Immune" (risk), and "PhysicalReadiness" (output). Each score must be one of three values: "high", "medium", or "low". Also provide a "Notes" string (2-3 sentences max) summarizing your reasoning in a supportive tone. Here is the user's log and any automated health data available:

User's Written Log: "${log}"

${healthDataString}
`;

    try {
        // --- Call the AI (e.g., OpenAI) ---
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo-1106',
                messages: [
                    { role: 'system', content: persona },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: "json_object" }
            })
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`AI API error: ${aiResponse.status} ${errorBody}`);
        }

        const aiData = await aiResponse.json();
        const analysis = JSON.parse(aiData.choices[0].message.content);

        // --- Save everything to the database ---
        const logEntry = {
            user_id: user.id,
            Log: log,
            Clarity: analysis.Clarity,
            Immune: analysis.Immune,
            PhysicalReadiness: analysis.PhysicalReadiness,
            Notes: analysis.Notes,
            sleep_hours,
            sleep_quality
        };

        const { data: newLog, error } = await supabase
            .from('logs')
            .insert(logEntry)
            .select()
            .single();

        if (error) throw error;

        return {
            statusCode: 200,
            body: JSON.stringify(newLog),
        };

    } catch (error) {
        console.error('Error in analyze-log function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

// Use module.exports.config for Netlify to recognize it correctly.
module.exports.config = {
  timeout: 25,
};