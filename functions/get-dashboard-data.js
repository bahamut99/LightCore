const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchLogCount(supabase, userId) {
    try {
        const { count, error } = await supabase
            .from('daily_logs')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);
        if (error) throw error;
        return count || 0;
    } catch (error) {
        console.error('Error fetching log count:', error.message);
        return 0;
    }
}

async function fetchWeeklySummary(supabase, userId, userTimezone) {
    try {
        const { data: goalData, error: goalError } = await supabase.from('goals').select('goal_value').eq('user_id', userId).eq('is_active', true).maybeSingle();
        if (goalError) {
            console.error("Error fetching goal in weekly summary:", goalError.message);
            return { goal: null, progress: 0 };
        }
        if (!goalData) {
            return { goal: null, progress: 0 };
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const { data: logDays, error: logsError } = await supabase.from('daily_logs')
            .select('created_at')
            .eq('user_id', userId)
            .gte('created_at', sevenDaysAgo.toISOString());
            
        if (logsError) throw logsError;

        const now = new Date();
        const userNow = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
        const startOfWeek = new Date(userNow);
        startOfWeek.setDate(userNow.getDate() - userNow.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const distinctDays = new Set();
        (logDays || []).forEach(log => {
            const logDate = new Date(log.created_at);
            if (logDate >= startOfWeek) {
                const localDateString = logDate.toLocaleDateString('en-CA', { timeZone: userTimezone });
                distinctDays.add(localDateString);
            }
        });

        return { goal: goalData, progress: distinctDays.size };
    } catch (error) {
        console.error('Error in fetchWeeklySummary:', error.message);
        return { goal: null, progress: 0 };
    }
}

async function fetchNudge(supabase, userId) {
    try {
        const { data } = await supabase.from('nudges').select('*').eq('user_id', userId).eq('is_acknowledged', false).order('created_at', { ascending: false }).limit(1).maybeSingle();
        return data;
    } catch (error) {
        console.error('Error fetching nudge:', error.message);
        return null;
    }
}

async function fetchRecentEntries(supabase, userId) {
    try {
        const { data } = await supabase.from('daily_logs').select('id, created_at, log, clarity_label, clarity_color, clarity_score, immune_label, immune_color, immune_score, physical_readiness_label, physical_readiness_color, physical_readiness_score, ai_notes, sleep_hours, sleep_quality').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
        return data || [];
    } catch (error) {
        console.error('Error fetching recent entries:', error.message);
        return [];
    }
}

async function fetchLightcoreGuide(supabase, supabaseAdmin, userId) {
    try {
        const { data: contextData, error: contextError } = await supabase.from('lightcore_brain_context').select('*').eq('user_id', userId).single();
        if (contextError || !contextData || !contextData.recent_logs || !contextData.recent_logs.length) {
            return { current_state: "Log your first entry to begin AI calibration." };
        }
        
        let formattedContext = `User's Most Recent Logs:\n` + contextData.recent_logs.slice(0, 7).map(log => {
            const date = new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `[${date}] Scores: Clarity=${log.clarity_score}, Immune=${log.immune_score}, Physical=${log.physical_readiness_score} | Log: "${log.log.substring(0, 75)}..."`;
        }).join('\n');

        const prompt = `You are Lightcore – a unified, personalized health AI guide. Review the user's recent data context. Your goal is to synthesize this information into a cohesive guidance message. Your entire response MUST be a single, valid JSON object with two top-level keys: "guidance_for_user" and "memory_update". 1. "guidance_for_user": An object with keys "current_state" (string), "positives" (array of strings), "concerns" (array of strings), "suggestions" (array of strings). 2. "memory_update": An object with keys "new_user_summary" (string) and "new_ai_persona_memo" (string). Analyze the following DATA CONTEXT:\n${formattedContext}`;

        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const aiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });
        if (!aiResponse.ok) throw new Error(`Gemini API error`);

        const aiData = await aiResponse.json();
        const guidanceText = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!guidanceText) throw new Error("No guidance was returned by the AI.");
        
        const fullResponse = JSON.parse(guidanceText);
        
        if(fullResponse.memory_update) {
            await supabaseAdmin.from('lightcore_brain_context').update({
                user_summary: fullResponse.memory_update.new_user_summary,
                ai_persona_memo: fullResponse.memory_update.new_ai_persona_memo,
                updated_at: new Date().toISOString()
            }).eq('user_id', userId);
        }

        return fullResponse.guidance_for_user;

    } catch (error) {
        console.error('Error fetching Lightcore guide:', error.message);
        return { error: "Could not load guidance at this time." };
    }
}

async function fetchChronoDeck(supabase, userId) {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { data } = await supabase.from('events').select('event_type, event_time').eq('user_id', userId).gte('event_time', sevenDaysAgo.toISOString()).order('event_time', { ascending: true });
        return data || [];
    } catch (error) {
        console.error('Error fetching ChronoDeck data:', error.message);
        return [];
    }
}

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };
    
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const supabaseAdmin = createAdminClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };
    
    const { tz: userTimezone } = event.queryStringParameters;

    try {
        const [
            logCountData,
            weeklySummaryData,
            nudgeData,
            recentEntriesData,
            lightcoreGuideData,
            chronoDeckData
        ] = await Promise.all([
            fetchLogCount(supabase, user.id),
            fetchWeeklySummary(supabase, user.id, userTimezone || 'UTC'),
            fetchNudge(supabase, user.id),
            fetchRecentEntries(supabase, user.id),
            fetchLightcoreGuide(supabase, supabaseAdmin, user.id),
            fetchChronoDeck(supabase, user.id)
        ]);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                logCount: logCountData,
                weeklySummaryData,
                nudgeData,
                recentEntriesData,
                lightcoreGuideData,
                chronoDeckData
            }),
        };

    } catch (error) {
        console.error("Error in get-dashboard-data function:", error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to load dashboard data." }),
        };
    }
};
