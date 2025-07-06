const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        // Fetch the latest unacknowledged nudge for the user
        const { data, error } = await supabase
            .from('nudges')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_acknowledged', false)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw new Error(`Supabase select error: ${error.message}`);

        return {
            statusCode: 200,
            body: JSON.stringify(data[0] || null), // Return the nudge object or null if none
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};