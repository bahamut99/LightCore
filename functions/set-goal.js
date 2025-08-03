const { createClient } = require('@supabase/supabase-js');

const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabaseUserClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        const { goal_type, goal_value } = JSON.parse(event.body);
        if (!goal_type || !goal_value) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing goal_type or goal_value.' }) };
        }

        const supabaseAdmin = createAdminClient();

        const { data: existingGoal, error: fetchError } = await supabaseAdmin
            .from('goals')
            .select('id')
            .eq('user_id', user.id)
            .eq('goal_type', goal_type)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            throw new Error(`Supabase fetch error: ${fetchError.message}`);
        }

        await supabaseAdmin
            .from('goals')
            .update({ is_active: false })
            .eq('user_id', user.id);

        let savedData;
        if (existingGoal) {
            const { data, error } = await supabaseAdmin
                .from('goals')
                .update({ goal_value: goal_value, is_active: true })
                .eq('id', existingGoal.id)
                .select()
                .single();
            if (error) throw new Error(`Supabase update error: ${error.message}`);
            savedData = data;
        } else {
            const { data, error } = await supabaseAdmin
                .from('goals')
                .insert({
                    user_id: user.id,
                    goal_type: goal_type,
                    goal_value: goal_value,
                    is_active: true,
                    time_period: 'weekly'
                })
                .select()
                .single();
            if (error) throw new Error(`Supabase insert error: ${error.message}`);
            savedData = data;
        }

        return {
            statusCode: 200,
            body: JSON.stringify(savedData),
        };

    } catch (error) {
        console.error("Critical error in set-goal function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};