const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        const { goal_type, goal_value } = JSON.parse(event.body);
        if (!goal_type || !goal_value) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing goal_type or goal_value.' }) };
        }

        // Deactivate all other goals for the user first
        await supabase
            .from('goals')
            .update({ is_active: false })
            .eq('user_id', user.id);

        // Upsert the new active goal
        // This will create a new goal or update an existing one for that user and type
        const { data, error } = await supabase
            .from('goals')
            .upsert({
                user_id: user.id,
                goal_type: goal_type,
                goal_value: goal_value,
                is_active: true,
                time_period: 'weekly' // Hardcoded for now
            }, {
                onConflict: 'user_id, goal_type'
            })
            .select()
            .single();

        if (error) throw new Error(`Supabase upsert error: ${error.message}`);

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