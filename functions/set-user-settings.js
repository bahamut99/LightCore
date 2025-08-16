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
        // CORRECTED METHOD: Initialize the client with the user's token in the headers
        const supabaseUserClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });

        // Now, getUser() will work correctly to identify the user
        const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
        if (userError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };
        }

        const { settings } = JSON.parse(event.body);
        if (!settings || !settings.preferred_ui) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing settings payload.' }) };
        }

        const supabaseAdmin = createAdminClient();
        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ preferred_ui: settings.preferred_ui })
            .eq('id', user.id);

        if (updateError) {
            throw new Error(`Supabase profile update error: ${updateError.message}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Settings updated successfully.' }),
        };

    } catch (error) {
        console.error('Error in set-user-settings:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};