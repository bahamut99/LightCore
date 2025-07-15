const { createClient } = require('@supabase/supabase-js');

// Helper to get the start of the current week (Sunday)
const getStartOfWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    startDate.setHours(0, 0, 0, 0);
    return startDate;
};

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        // 1. Get the user's active goal
        const { data: goal, error: goalError } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();

        if (goalError && goalError.code !== 'PGRST116') throw new Error(`Goal fetch error: ${goalError.message}`);
        
        // If no active goal, no progress to report
        if (!goal) return { statusCode: 200, body: JSON.stringify(null) };

        // 2. Count distinct log days for the current week
        const startOfWeek = getStartOfWeek();
        const { data: logs, error: logsError } = await supabase
            .from('daily_logs')
            .select('created_at', { count: 'exact', head: true }) // We only need the count
            .eq('user_id', user.id)
            .gte('created_at', startOfWeek.toISOString());
            
        // Supabase doesn't have a direct "distinct on day" count, so we fetch and process
        const { data: logDays, error: logDaysError } = await supabase
             .from('daily_logs')
             .select('created_at')
             .eq('user_id', user.id)
             .gte('created_at', startOfWeek.toISOString());

        if (logDaysError) throw new Error(`Log fetch error: ${logDaysError.message}`);

        const distinctDays = new Set(logDays.map(log => new Date(log.created_at).toDateString()));
        const progress = distinctDays.size;

        return {
            statusCode: 200,
            body: JSON.stringify({ goal, progress }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};