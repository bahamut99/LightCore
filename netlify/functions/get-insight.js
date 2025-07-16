const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        const { data: logs, error: logsError } = await supabase
            .from('daily_logs')
            .select('id, created_at, log, clarity_score, immune_score, physical_readiness_score, sleep_hours, sleep_quality')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(12);

        if (logsError) throw new Error(`Supabase log fetch error: ${logsError.message}`);
        
        const qualityLogs = logs ? logs.filter(l => l.clarity_score || l.immune_score || l.physical_readiness_score) : [];

        if (qualityLogs.length < 3) return { statusCode: 200, body: JSON.stringify({ insight: 'Log a few more days with timed events to unlock new insights.' }) };

        const logIds = qualityLogs.map(l => l.id);
        const { data: events, error: eventsError } = await supabase
            .from('events')
            .select('log_id, event_type, event_time')
            .in('log_id', logIds);

        if (eventsError) throw new Error(`Supabase event fetch error: ${eventsError.message}`);

        const combinedData = qualityLogs.map(log => ({
            ...log,
            events: events ? events.filter(e => e.log_id === log.id) : []
        }));

        const hasAnyEvents = combinedData.some(log => log.events.length > 0);
        
        let prompt;
        let formattedDataForAI;

        if (hasAnyEvents) {
            formattedDataForAI = combinedData.map(log => {
                const dateString = `Date: ${new Date(log.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
                const scoresString = `Scores: Clarity=${log.clarity_score}, Immune=${log.immune_score}, Physical=${log.physical_readiness_score}`;
                let sleepString = 'Sleep Data: N/A';
                if(log.sleep_hours) sleepString = `Sleep Data: ${log.sleep_hours} hours (Quality: ${log.sleep_quality || 'N/A'}/5)`;
                const eventsString = log.events.length > 0 
                    ? 'Events:\n' + log.events.sort((a, b) => new Date(a.event_time) - new Date(b.event_time)).map(e => `- ${e.event_type} at ${new Date(e.event_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute:'2-digit' })}`).join('\n')
                    : 'Events: None';
                return `${dateString}\n${scoresString}\n${sleepString}\n${eventsString}`;
            }).join('\n\n---\n\n');

            prompt = `You're a personal health AI analyst reviewing a user's journal. Your goal is to find one interesting and specific correlation between the *timing* of events and the user's health scores. Focus on *when* something happened. Examples: "Caffeine after 3PM tends to correlate with lower sleep quality." or "Morning workouts seem to correlate with better Mental Clarity." Be concise. Start your response with "I've noticed that..." or "It's interesting that...". Only give one insight. DATA:\n${formattedDataForAI}`;

        } else {
            formattedDataForAI = combinedData.map(log => {
                const dateString = `Date: ${new Date(log.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
                const scoresString = `Scores: Clarity=${log.clarity_score}, Immune=${log.immune_score}, Physical=${log.physical_readiness_score}`;
                const logString = `Log: "${log.log}"`;
                return `${dateString}\n${scoresString}\n${logString}`;
            }).join('\n\n---\n\n');

            prompt = `You're a personal health AI analyst reviewing a user's journal. Your goal is to find one interesting correlation between their written log entries and their health scores. Be concise. Start your response with "I've noticed that..." or "It's interesting that...". Only give one insight. DATA:\n${formattedDataForAI}`;
        }
        
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
        const insight = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        
        if (!insight) {
            throw new Error("No insight was returned by the AI.");
        }

        // --- NEW: Update AI Memory Context ---
        const supabaseAdmin = createAdminClient();
        const { data: contextData, error: contextError } = await supabaseAdmin
            .from('lightcore_brain_context')
            .select('recent_insights')
            .eq('user_id', user.id)
            .single();

        if (contextError && contextError.code !== 'PGRST116') {
             console.error("Error fetching context for insight update:", contextError.message);
        } else {
            let existingInsights = contextData?.recent_insights || [];
            const newInsights = [insight, ...existingInsights].slice(0, 5);
            await supabaseAdmin
                .from('lightcore_brain_context')
                .upsert({
                    user_id: user.id,
                    recent_insights: newInsights,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
        }
        // --- End of new logic ---

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