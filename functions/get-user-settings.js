const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };
    }

    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('preferred_ui')
            .eq('id', user.id)
            .single();

        if (profileError) {
            throw new Error(`Supabase profile fetch error: ${profileError.message}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify(profile),
        };

    } catch (error) {
        console.error('Error in get-user-settings:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};