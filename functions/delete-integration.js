const { createClient } = require('@supabase/supabase-js');

const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const token = event.headers.authorization?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };
    }

    try {
        // Authenticate the user with their own token
        const supabaseUserClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(token);
        if (userError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };
        }

        const { provider } = JSON.parse(event.body);
        if (!provider) {
             return { statusCode: 400, body: JSON.stringify({ error: 'Missing provider name.' }) };
        }

        const supabaseAdmin = createAdminClient();

        // Use the admin client to delete the specific integration for that user
        const { error } = await supabaseAdmin
            .from('user_integrations')
            .delete()
            .eq('user_id', user.id)
            .eq('provider', provider);
        
        if (error) {
            throw new Error(`Supabase delete error: ${error.message}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Integration disconnected successfully.' }),
        };

    } catch (error) {
        console.error("Error in delete-integration function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};