const { createClient } = require('@supabase/supabase-js');

// Helper function to create a secure admin client
const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    // This part is for validating the user token and is correct
    const supabaseUserClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        const { goal_type, goal_value } = JSON.parse(event.body);
        if (!goal_type || !goal_value) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing goal_type or goal_value.' }) };
        }

        // For all database modifications, we now use the secure admin client
        const supabaseAdmin = createAdminClient();

        // Check if a goal of this type already exists for the user
        const { data: existingGoal, error: fetchError } = await supabaseAdmin
            .from('goals')
            .select('id')
            .eq('user_id', user.id)
            .eq('goal_type', goal_type)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') { // Ignore "not found" error
            throw new Error(`Supabase fetch error: ${fetchError.message}`);
        }

        // Deactivate all other goals for the user first
        await supabaseAdmin
            .from('goals')
            .update({ is_active: false })
            .eq('user_id', user.id);

        let savedData;
        if (existingGoal) {
            // If it exists, UPDATE it with the new value and set it to active
            const { data, error } = await supabaseAdmin
                .from('goals')
                .update({ goal_value: goal_value, is_active: true })
                .eq('id', existingGoal.id)
                .select()
                .single();
            if (error) throw new Error(`Supabase update error: ${error.message}`);
            savedData = data;
        } else {
            // If it does not exist, INSERT a new one
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