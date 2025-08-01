const { createClient } = require('@supabase/supabase-js');

// Helper to create a secure admin client
const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const token = event.headers.authorization?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };
    }

    const supabaseUserClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(token);
    if (userError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };
    }

    try {
        const { nudgeId } = JSON.parse(event.body);
        if (!nudgeId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing nudgeId.' }) };
        }

        const supabaseAdmin = createAdminClient();

        // Mark the specific nudge as acknowledged, ensuring it belongs to the current user
        const { error } = await supabaseAdmin
            .from('nudges')
            .update({ is_acknowledged: true })
            .eq('id', nudgeId)
            .eq('user_id', user.id); // Security check to prevent users acknowledging others' nudges

        if (error) {
            throw new Error(`Supabase update error: ${error.message}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Nudge acknowledged successfully.' }),
        };

    } catch (error) {
        console.error("Error in acknowledge-nudge function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};