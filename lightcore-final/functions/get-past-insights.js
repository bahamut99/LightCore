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
            .select('created_at, ai_notes', { count: 'exact' }) // Get total count
            .eq('user_id', user.id)
            .not('ai_notes', 'is', null)
            .order('created_at', { ascending: false });

        // Apply date filters if provided
        if (startDate) {
            query = query.gte('created_at', startDate);
        }
        if (endDate) {
            // Add 1 day to end date to make the range inclusive
            const inclusiveEndDate = new Date(endDate);
            inclusiveEndDate.setDate(inclusiveEndDate.getDate() + 1);
            query = query.lte('created_at', inclusiveEndDate.toISOString());
        }

        // Apply pagination
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