const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Not authorized.');

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) throw new Error('User not found.');

        const { data: logs, error } = await supabase
            .from('daily_logs')
            .select('created_at, log, clarity_score, immune_score, physical_readiness_score, ai_notes')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(15);

        if (error) throw new Error(`Supabase fetch error: ${error.message}`);
        if (logs.length < 3) return { statusCode: 200, body: JSON.stringify({ insight: 'Log a few more entries to unlock new insights.' }) };

        const prompt = `Analyze these logs and find one new insight...\n\n${JSON.stringify(logs, null, 2)}`;

        // MODIFIED: Using the correct gemini-1.5-flash model
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
        console.error('Error in get-insight function:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};