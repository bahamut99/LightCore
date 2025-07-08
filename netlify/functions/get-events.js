const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    try {
        // **FIX**: Initialize the Supabase client with the user's auth token directly.
        // This applies the same robust pattern we used for the parse-events function.
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: {
                headers: { Authorization: `Bearer ${token}` }
            }
        });

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data, error } = await supabase
            .from('events')
            .select('event_type, event_time')
            .eq('user_id', user.id)
            .gte('event_time', sevenDaysAgo.toISOString())
            .order('event_time', { ascending: true });

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