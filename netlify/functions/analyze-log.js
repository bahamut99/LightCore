const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    console.log('--- analyze-log function started ---');
    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) {
            console.error('Auth Error: No token provided.');
            return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized: No token.' }) };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            console.error('Auth Error: User not found or token invalid.', userError);
            return { statusCode: 401, body: JSON.stringify({ error: 'User not found or token invalid.' }) };
        }
        console.log('Step 1: User authenticated successfully.');

        const { log, sleep_hours, sleep_quality } = JSON.parse(event.body);

        let healthDataString = "";
        try {
            console.log('Step 2: Attempting to fetch health data...');
            const healthResponse = await fetch('https://lightcorehealth.netlify.app/.netlify/functions/fetch-health-data', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log(`Step 2a: Health data fetch response status: ${healthResponse.status}`);
            
            if (healthResponse.ok) {
                const data = await healthResponse.json();
                if (data && data.steps !== null && data.steps !== undefined) {
                    healthDataString = `\n---\nAutomated Health Data:\n- Today's Step Count: ${data.steps}\n---`;
                }
            }
        } catch (e) {
            console.error("Non-critical error: Could not fetch health data.", e);
        }
        
        const persona = `You are a holistic health coach...`; // (Content is the same)
        const prompt = `...User's Written Log: "${log}"\n${healthDataString}`; // (Content is the same)

        console.log('Step 3: Calling OpenAI API...');
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
        console.log(`Step 3a: OpenAI response status: ${aiResponse.status}`);

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`AI API error: ${aiResponse.status} ${errorBody}`);
        }

        const aiData = await aiResponse.json();
        console.log('Step 4: AI response received and parsed.');
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

        console.log('Step 5: Inserting new log into database...');
        const { data: newLog, error: dbError } = await supabase.from('logs').insert(logEntry).select().single();
        if (dbError) throw dbError;
        
        console.log('Step 6: Successfully finished.');
        return {
            statusCode: 200,
            body: JSON.stringify(newLog),
        };

    } catch (error) {
        console.error('--- CRITICAL ERROR in analyze-log ---');
        console.error('Error Message:', error.message);
        console.error('Full Error Object:', JSON.stringify(error, null, 2));
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'A critical error occurred. Check function logs.' }),
        };
    }
};

module.exports.config = {
  timeout: 25,
};