const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    const { limit = 20, offset = 0, startDate, endDate } = event.queryStringParameters;

    try {
        let query = supabase
            .from('daily_logs')
            .select('created_at, ai_notes', { count: 'exact' })
            .eq('user_id', user.id)
            .not('ai_notes', 'is', null)
            .order('created_at', { ascending: false });

        if (startDate) {
            query = query.gte('created_at', startDate);
        }
        
        // --- THIS IS THE FIX ---
        // Replaced the old logic with a more precise "end of day" calculation.
        if (endDate) {
            const endOfDay = new Date(endDate);
            endOfDay.setHours(23, 59, 59, 999); // Set to the last millisecond of the selected day
            query = query.lte('created_at', endOfDay.toISOString());
        }

        query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        const { data, error, count } = await query;

        if (error) {
            throw new Error(`Supabase fetch error: ${error.message}`);
        }

        const insights = data
            .filter(item => item.ai_notes)
            .map(item => ({
                created_at: item.created_at,
                insight_text: item.ai_notes 
            }));

        return {
            statusCode: 200,
            body: JSON.stringify({ insights, count }),
        };
    } catch (error) {
        console.error('Error in get-past-insights function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};