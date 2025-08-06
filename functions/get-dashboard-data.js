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

async function fetchWeeklySummary(supabase, userId) {
    try {
        const { data: goalData } = await supabase.from('goals').select('goal_value').eq('user_id', userId).eq('is_active', true).maybeSingle();
        if (!goalData) return { goal: null, progress: 0 };
        
        // FIX: This logic is now more robust against timezone issues.
        // It gets the start of the current week (Sunday) in the server's UTC time,
        // which provides a consistent anchor point for the query.
        const today = new Date();
        const dayOfWeek = today.getUTCDay(); // Use UTC day
        const startOfWeek = new Date(today);
        startOfWeek.setUTCDate(today.getUTCDate() - dayOfWeek);
        startOfWeek.setUTCHours(0, 0, 0, 0);

        const { data: logDays, error } = await supabase.from('daily_logs')
            .select('created_at')
            .eq('user_id', userId)
            .gte('created_at', startOfWeek.toISOString());
            
        if (error) throw error;

        const distinctDays = new Set((logDays || []).map(log => new Date(log.created_at).toDateString()));
        return { goal: goalData, progress: distinctDays.size };
    } catch (error) {
        console.error('Error fetching weekly summary:', error.message);
        return { goal: null, progress: 0 };
    }
}

async function fetchNudge(supabase, userId) {
    // ... (This function remains unchanged)
}

async function fetchTrendsData(supabase, userId, range) {
    // ... (This function remains unchanged)
}

async function fetchRecentEntries(supabase, userId) {
    // ... (This function remains unchanged)
}

async function fetchLightcoreGuide(supabase, supabaseAdmin, userId) {
    // ... (This function remains unchanged)
}

async function fetchChronoDeck(supabase, userId) {
    // ... (This function remains unchanged)
}

// Handler remains the same, only the helper function above was changed.
exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };
    
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const supabaseAdmin = createAdminClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };
    
    const range = parseInt(event.queryStringParameters.range) || 7;

    try {
        const [
            logCountData,
            weeklySummaryData,
            nudgeData,
            trendsData,
            recentEntriesData,
            lightcoreGuideData,
            chronoDeckData
        ] = await Promise.all([
            fetchLogCount(supabase, user.id),
            fetchWeeklySummary(supabase, user.id),
            fetchNudge(supabase, user.id),
            fetchTrendsData(supabase, user.id, range),
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