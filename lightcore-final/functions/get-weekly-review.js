const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Helper to get the start and end dates for the *previous* full week (Sun-Sat)
const getLastWeekDateRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    
    // Last Saturday was today's date minus (day of week + 1) days
    const endOfLastWeek = new Date(today);
    endOfLastWeek.setDate(today.getDate() - (dayOfWeek + 1));
    endOfLastWeek.setHours(23, 59, 59, 999);

    // Start of last week was 6 days before that
    const startOfLastWeek = new Date(endOfLastWeek);
    startOfLastWeek.setDate(endOfLastWeek.getDate() - 6);
    startOfLastWeek.setHours(0, 0, 0, 0);

    return { start: startOfLastWeek, end: endOfLastWeek };
};

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        const { start, end } = getLastWeekDateRange();

        // 1. Fetch all logs from the previous week
        const { data: logs, error: logsError } = await supabase
            .from('daily_logs')
            .select('clarity_score, immune_score, physical_readiness_score, tags')
            .eq('user_id', user.id)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString());

        if (logsError) throw new Error(`Log fetch error: ${logsError.message}`);
        if (!logs || logs.length < 3) {
            return { statusCode: 200, body: JSON.stringify({ review: null, message: "Not enough data from last week to generate a review." }) };
        }

        // 2. Fetch the user's active goal
        const { data: goal } = await supabase.from('goals').select('*').eq('user_id', user.id).eq('is_active', true).single();

        // 3. Summarize the data for the AI
        let totalClarity = 0, totalImmune = 0, totalPhysical = 0;
        const tagCounts = {};
        
        logs.forEach(log => {
            totalClarity += log.clarity_score || 0;
            totalImmune += log.immune_score || 0;
            totalPhysical += log.physical_readiness_score || 0;
            if (log.tags) {
                log.tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });

        const logCount = logs.length;
        const summary = {
            logCount: logCount,
            goal: goal ? `Their goal was to log ${goal.goal_value} times. They met this goal: ${logCount >= goal.goal_value}.` : 'No goal was set.',
            avgClarity: (totalClarity / logCount).toFixed(1),
            avgImmune: (totalImmune / logCount).toFixed(1),
            avgPhysical: (totalPhysical / logCount).toFixed(1),
            topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(item => item[0])
        };

        // 4. Create the prompt and call the AI
        const prompt = `
        You are Lightcore, a personal health guide. Your task is to write a short, encouraging "Weekly Review" for your user based on a summary of their health data from last week.

        Your response MUST be a single, valid JSON object with the following keys: "headline", "narrative", and "key_takeaway".
        - "headline": A short, engaging title for the review (e.g., "A Strong Week for Clarity!").
        - "narrative": A 2-3 sentence story about their week, connecting their goal progress and top themes (tags) to their average scores.
        - "key_takeaway": One specific, actionable piece of advice or an interesting pattern to notice for the week ahead.

        Here is the summary of the user's data from last week:
        - Goal Progress: ${summary.goal}
        - They logged data on ${summary.logCount} days.
        - Average Scores: Mental Clarity was ${summary.avgClarity}, Immune Risk was ${summary.avgImmune}, Physical Output was ${summary.avgPhysical}.
        - The most common themes in their logs were: ${summary.topTags.join(', ')}.

        Based on this data, generate the JSON response.
        `;
        
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