const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        const { data: logs, error } = await supabase
            .from('daily_logs')
            .select('created_at, log, clarity_score, immune_score, physical_readiness_score, ai_notes')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(15);

        if (error) throw new Error(`Supabase fetch error: ${error.message}`);
        if (logs.length < 3) return { statusCode: 200, body: JSON.stringify({ insight: 'Log a few more entries to unlock new insights.' }) };

        const persona = `You are a health data analyst. Your job is to find a single, actionable correlation in the provided health data logs.`;
        const prompt = `Analyze the following user health logs to find one new, interesting, and actionable correlation. Present it as a concise insight, starting with "I've noticed a pattern:" or "It's interesting that...". Be encouraging and brief. The data is an array of JSON objects:\n\n${JSON.stringify(logs, null, 2)}`;

        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const aiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`Gemini API error: ${aiResponse.status} ${errorBody}`);
        }

        const aiData = await aiResponse.json();
        const insight = aiData.candidates[0].content.parts[0].text;

        return {
            statusCode: 200,
            body: JSON.stringify({ insight }),
        };

    } catch (error) {
        console.error('Error in get-insight function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};