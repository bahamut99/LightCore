const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const getStartOfLastWeek = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - dayOfWeek - 7);
    return startDate;
};

const getEndOfLastWeek = () => {
    const startOfLastWeek = getStartOfLastWeek();
    const endDate = new Date(startOfLastWeek);
    endDate.setDate(startOfLastWeek.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
    return endDate;
};

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        const start = getStartOfLastWeek();
        const end = getEndOfLastWeek();

        const { data: logs, error: logsError } = await supabase
            .from('daily_logs')
            .select('clarity_score, immune_score, physical_readiness_score, tags, created_at')
            .eq('user_id', user.id)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString());

        if (logsError) throw new Error(`Log fetch error: ${logsError.message}`);
        if (!logs || logs.length < 3) {
            return { statusCode: 200, body: JSON.stringify({ review: null, message: "Not enough data from last week to generate a review." }) };
        }

        const { data: goal } = await supabase.from('goals').select('*').eq('user_id', user.id).eq('is_active', true).single();

        let totalClarity = 0, totalImmune = 0, totalPhysical = 0;
        const tagCounts = {};
        const distinctDays = new Set(logs.map(log => new Date(log.created_at).toDateString()));
        
        logs.forEach(log => {
            totalClarity += log.clarity_score || 0;
            totalImmune += log.immune_score || 0;
            totalPhysical += log.physical_readiness_score || 0;
            if (log.tags) {
                log.tags.forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
            }
        });

        const logCount = distinctDays.size; // FIX: Use the size of the Set for distinct days
        const summary = {
            logCount: logCount,
            goal: goal ? `Their goal was to log ${goal.goal_value} times a week. They logged on ${logCount} days.` : 'No active goal was set.',
            avgClarity: (totalClarity / logs.length).toFixed(1),
            avgImmune: (totalImmune / logs.length).toFixed(1),
            avgPhysical: (totalPhysical / logs.length).toFixed(1),
            topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(item => item[0])
        };

        const prompt = `You are Lightcore, a personal health guide...`; // Remainder of prompt is the same
        
        // ... (The rest of your Gemini API call logic remains the same)
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const aiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!aiResponse.ok) throw new Error(`Gemini API error: ${await aiResponse.text()}`);

        const aiData = await aiResponse.json();
        const reviewText = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!reviewText) throw new Error("AI did not return a review.");

        const review = JSON.parse(reviewText);

        return {
            statusCode: 200,
            body: JSON.stringify({ review }),
        };

    } catch (error) {
        console.error('Error in get-weekly-review function:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Sorry, I couldn't generate a weekly review right now." }),
        };
    }
};