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
        
        const persona = `You are a holistic health coach with a kind and empathetic "bedside manner."`;
        const prompt = `Based on the user's daily log, provide scores for "Clarity" (mental), "Immune" (risk), and "PhysicalReadiness" (output). Each score must be one of three values: "high", "medium", or "low". Also provide a "Notes" string (2-3 sentences max) summarizing your reasoning in a supportive tone. Return your response in a valid JSON object format.

User's Written Log: "${log}"
${healthDataString}`;

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo-1106',
                messages: [{ role: 'system', content: persona }, { role: 'user', content: prompt }],
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
        
        // MODIFIED: Removed the .single() modifier to make the insert more robust.
        const { data: newLogData, error: dbError } = await supabase
            .from('logs')
            .insert(logEntry)
            .select();

        if (dbError) {
            throw new Error(`Supabase insert error: ${dbError.message}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify(newLogData[0]), // Return the first (and only) inserted record
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