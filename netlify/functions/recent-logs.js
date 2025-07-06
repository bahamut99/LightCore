const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };
    
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        // MODIFIED: Select only the specific, correct snake_case columns
        const { data, error } = await supabase
            .from('daily_logs')
            .select('id, created_at, log, clarity_label, clarity_color, immune_label, immune_color, physical_readiness_label, physical_readiness_color, ai_notes, sleep_hours, sleep_quality, clarity_score, immune_score, physical_readiness_score')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw new Error(`Supabase select error: ${error.message}`);
        
        return {
            statusCode: 200,
            body: JSON.stringify(data),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};