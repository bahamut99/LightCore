const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Not authorized: No token.');

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) throw new Error(userError?.message || 'User not found.');

        const { data: logs, error: dbError } = await supabase
            .from('daily_logs')
            .select('created_at, log, clarity_score, immune_score, physical_readiness_score, ai_notes')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(15);

        if (dbError) throw new Error(`Supabase fetch error: ${dbError.message}`);
        if (!logs || logs.length < 3) {
            return {
                statusCode: 200,
                body: JSON.stringify({ insight: 'Log a few more entries to unlock new insights.' }),
            };
        }

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

        // Save this new insight to the latest log entry
        const latestLogId = logs[0].id; // Assuming the first log is the latest
        if (latestLogId && insight) {
            await supabase
                .from('daily_logs')
                .update({ ai_insight: insight })
                .eq('id', latestLogId);
        }

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