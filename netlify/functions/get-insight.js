const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        // Step 1: Fetch logs with new sleep data fields
        const { data: logs, error: logsError } = await supabase
            .from('daily_logs')
            .select('id, created_at, log, clarity_score, immune_score, physical_readiness_score, sleep_hours, sleep_quality')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20); // Fetch a few more to allow for filtering

        if (logsError) throw new Error(`Supabase log fetch error: ${logsError.message}`);
        if (!logs) return { statusCode: 200, body: JSON.stringify({ insight: 'Not enough data yet.' }) };
        
        // Step 2: Fetch all events related to those logs
        const logIds = logs.map(l => l.id);
        const { data: events, error: eventsError } = await supabase
            .from('events')
            .select('log_id, event_type, event_time')
            .in('log_id', logIds);

        if (eventsError) throw new Error(`Supabase event fetch error: ${eventsError.message}`);

        // Step 3: Combine and filter the data for quality
        const combinedData = logs.map(log => {
            const logEvents = events ? events.filter(e => e.log_id === log.id) : [];
            return { ...log, events: logEvents };
        });

        const filteredData = combinedData.filter(log => {
            const hasScores = log.clarity_score || log.immune_score || log.physical_readiness_score;
            const hasEvents = log.events.length > 0;
            return hasScores && hasEvents;
        });

        if (filteredData.length < 3) return { statusCode: 200, body: JSON.stringify({ insight: 'Log a few more days with timed events to unlock new insights.' }) };

        // Step 4: Format the high-quality data for the new AI prompt
        const formattedDataForAI = filteredData.map(log => {
            const dateString = `Date: ${new Date(log.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
            const scoresString = `Scores: Clarity=${log.clarity_score}, Immune=${log.immune_score}, Physical=${log.physical_readiness_score}`;
            
            let sleepString = 'Sleep Data: N/A';
            if(log.sleep_hours) {
                sleepString = `Sleep Data: ${log.sleep_hours} hours (Quality: ${log.sleep_quality || 'N/A'}/5)`;
            }
            
            const eventsString = 'Events:\n' + log.events
                .sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
                .map(e => `- ${e.event_type} at ${new Date(e.event_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute:'2-digit' })}`)
                .join('\n');

            return `${dateString}\n${scoresString}\n${sleepString}\n${eventsString}`;
        }).join('\n\n---\n\n');

        // Step 5: Use the new, more constrained prompt
        const prompt = `You're a personal health AI analyst. You are reviewing a user's journal logs and their daily health scores.
Each entry includes health scores (Mental Clarity, Immune Risk, Physical Output), sleep data, and timed events (e.g., caffeine, workout) with 24-hour timestamps.
Your goal is to find one interesting and specific correlation between the *timing* of these events and the user's health scores. Focus on *when* something happened—not just *what*.

Examples of good insights:
- "Caffeine after 3PM tends to correlate with lower sleep quality."
- "Morning workouts seem to correlate with better Mental Clarity on the same day."

Be concise and use plain language. Start your response with "I've noticed that..." or "It's interesting that...".
Only give one insight. Do not include preambles, conversational filler, or explanations.

DATA:
${formattedDataForAI}
`;
        
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
        
        // Step 6: Add robust error handling for the response
        const insight = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        
        if (!insight) {
            throw new Error("No insight was returned by the AI.");
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ insight }),
        };

    } catch (error) {
        console.error('Error in get-insight function:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Sorry, I couldn't generate an insight right now." }),
        };
    }
};