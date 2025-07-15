const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        // Fetch the current active goal for the user
        const { data, error } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1)
            .single(); // .single() returns one object, or null if not found

        if (error && error.code !== 'PGRST116') { // PGRST116 means "No rows found", which is not an error here
            throw new Error(`Supabase select error: ${error.message}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify(data), // This will be the goal object or null
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};