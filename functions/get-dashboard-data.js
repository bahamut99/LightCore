const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// --- Helper Functions (logic copied from individual function files) ---

async function fetchWeeklySummary(supabase, userId) {
    const getStartOfWeek = () => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        return startDate;
    };
    try {
        const { data: goal } = await supabase.from('goals').select('*').eq('user_id', userId).eq('is_active', true).single();
        if (!goal) return null;
        
        const startOfWeek = getStartOfWeek();
        const { data: logDays } = await supabase.from('daily_logs').select('created_at').eq('user_id', userId).gte('created_at', startOfWeek.toISOString());
        
        const distinctDays = new Set((logDays || []).map(log => new Date(log.created_at).toDateString()));
        return { goal, progress: distinctDays.size };
    } catch (error) {
        if (error.code !== 'PGRST116') console.error('Error fetching weekly summary:', error.message);
        return null; // Return null if no goal is found or on error
    }
}

async function fetchNudge(supabase, userId) {
    try {
        const { data } = await supabase.from('nudges').select('*').eq('user_id', userId).eq('is_acknowledged', false).order('created_at', { ascending: false }).limit(1);
        return data ? data[0] : null;
    } catch (error) {
        console.error('Error fetching nudge:', error.message);
        return null;
    }
}

async function fetchTrendsData(supabase, userId, range) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (range - 1));
    startDate.setHours(0, 0, 0, 0);
    try {
        const { data } = await supabase.from('daily_logs').select('created_at, clarity_score, immune_score, physical_readiness_score').eq('user_id', userId).gte('created_at', startDate.toISOString()).order('created_at', { ascending: true });
        
        let processedData = data || [];
        if (range > 1 && processedData.length > 0) {
            const groups = processedData.reduce((acc, log) => {
                const date = new Date(log.created_at).toISOString().split('T')[0];
                if (!acc[date]) acc[date] = [];
                acc[date].push(log);
                return acc;
            }, {});

            processedData = Object.entries(groups).map(([date, logs]) => {
                const totals = logs.reduce((acc, log) => ({
                    clarity: acc.clarity + (log.clarity_score || 0),
                    immune: acc.immune + (log.immune_score || 0),
                    physical: acc.physical + (log.physical_readiness_score || 0),
                }), { clarity: 0, immune: 0, physical: 0 });
                return {
                    created_at: date,
                    clarity_score: totals.clarity / logs.length,
                    immune_score: totals.immune / logs.length,
                    physical_readiness_score: totals.physical / logs.length,
                };
            });
        }
        return {
            labels: processedData.map(log => log.created_at),
            clarityData: processedData.map(log => log.clarity_score),
            immuneData: processedData.map(log => log.immune_score),
            physicalData: processedData.map(log => log.physical_readiness_score),
        };
    } catch (error) {
        console.error('Error fetching trends data:', error.message);
        return { labels: [], clarityData: [], immuneData: [], physicalData: [] };
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

async function fetchLightcoreGuide(supabase, userId) {
     try {
        const { data: contextData } = await supabase.from('lightcore_brain_context').select('*').eq('user_id', userId).single();
        if (!contextData || !contextData.recent_logs || contextData.recent_logs.length === 0) {
             return { current_state: "Log data for a few days to start generating personalized guidance." };
        }
        
        // This is a simplified call; in a real scenario, you'd re-use the full generate-guidance logic
        const response = await fetch('https://lightcorehealth.netlify.app/.netlify/functions/generate-guidance', {
            headers: { 'Authorization': `Bearer ${supabase.auth.headers.Authorization.split(' ')[1]}` }
        });
        const data = await response.json();
        return data.guidance;

    } catch (error) {
        console.error('Error fetching Lightcore guide:', error.message);
        return { error: "Could not load guidance at this time." };
    }
}

async function fetchChronoDeck(supabase, userId) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    try {
        const { data } = await supabase.from('events').select('event_type, event_time').eq('user_id', userId).gte('event_time', sevenDaysAgo.toISOString()).order('event_time', { ascending: true });
        return data || [];
    } catch (error) {
        console.error('Error fetching ChronoDeck data:', error.message);
        return [];
    }
}

// --- Main Handler ---

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };
    
    // Create a Supabase client with the user's auth token
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };
    
    // Get the chart range from the query parameters, default to 7
    const range = parseInt(event.queryStringParameters.range) || 7;

    try {
        // Run all data-fetching operations in parallel
        const [
            weeklySummaryData,
            nudgeData,
            trendsData,
            recentEntriesData,
            lightcoreGuideData,
            chronoDeckData
        ] = await Promise.all([
            fetchWeeklySummary(supabase, user.id),
            fetchNudge(supabase, user.id),
            fetchTrendsData(supabase, user.id, range),
            fetchRecentEntries(supabase, user.id),
            fetchLightcoreGuide(supabase, user.id),
            fetchChronoDeck(supabase, user.id)
        ]);
        
        // Return all the data in a single, organized object
        return {
            statusCode: 200,
            body: JSON.stringify({
                weeklySummaryData,
                nudgeData,
                trendsData,
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