const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // --- Correctly authenticate the user via Supabase JWT ---
    const token = event.headers.authorization.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized: No token.'}) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'User not found or token invalid.'}) };
    }

    const { log, sleep_hours, sleep_quality } = JSON.parse(event.body);

    let healthDataString = "";
    try {
        // Call our function to get health data, passing the auth token
        const healthResponse = await fetch('https://lightcorehealth.netlify.app/.netlify/functions/fetch-health-data', {
            method: 'POST', // Use POST to send a body
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (healthResponse.ok) {
            const data = await healthResponse.json();
            if (data && data.steps !== null && data.steps !== undefined) {
                healthDataString = `
---
Automated Health Data:
- Today's Step Count: ${data.steps}
---
`;
            }
        } else {
             console.error(`Failed to fetch health data: ${healthResponse.status}`);
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

module.exports.config = {
  timeout: 25,
};