const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const { createClient } = require('@supabase/supabase-js');

// --- Helper to get a Supabase client with the user's permissions ---
const getSupabaseClient = (event) => {
    // Safely handle the cookie header in case it's missing
    const cookieHeader = event.headers.cookie || '';
    const user_jwt = cookieHeader.split('; ').find(c => c.startsWith('nf_jwt='))?.split('=')[1];

    if (!user_jwt) throw new Error('Not authorized. User cookie not found.');

    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${user_jwt}` } }
    });
};

// --- Helper to get a fresh access token ---
async function getValidAccessToken(supabase, userId) {
    let { data: tokens, error } = await supabase
        .from('user_integrations')
        .select('access_token, refresh_token, expires_at')
        .eq('user_id', userId)
        .eq('provider', 'google-health') // Ensure we get the correct provider
        .single();

    if (error) throw new Error('No Google Health integration tokens found for this user.');

    // If the token is not expired, return it.
    if (new Date(tokens.expires_at) > new Date()) {
        return tokens.access_token;
    }

    // The token is expired, so we need to refresh it.
    console.log('Access token expired, refreshing...');
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });

    const newTokens = await response.json();
    if (newTokens.error) throw new Error(`Google token refresh error: ${newTokens.error_description}`);

    // Save the new token and expiration date to our database
    const new_expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
    const { error: updateError } = await supabase
        .from('user_integrations')
        .update({
            access_token: newTokens.access_token,
            expires_at: new_expires_at
        })
        .eq('user_id', userId)
        .eq('provider', 'google-health');

    if (updateError) console.error('Error updating new token:', updateError.message);
    
    return newTokens.access_token;
}

// --- Main handler ---
exports.handler = async (event, context) => {
    try {
        const supabase = getSupabaseClient(event);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not found.');

        const accessToken = await getValidAccessToken(supabase, user.id);

        // --- Fetch Step Count from Google Fitness API ---
        const now = new Date();
        const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0); // Start of today

        const requestBody = {
            aggregateBy: [{
                dataTypeName: "com.google.step_count.delta",
                dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
            }],
            bucketByTime: { durationMillis: 86400000 }, // 24 hours in milliseconds
            startTimeMillis: startTime.getTime(),
            endTimeMillis: now.getTime()
        };

        const fitnessResponse = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const fitnessData = await fitnessResponse.json();
        
        let stepCount = 0;
        if (fitnessData.bucket && fitnessData.bucket[0].dataset[0].point.length > 0) {
            stepCount = fitnessData.bucket[0].dataset[0].point[0].value[0].intVal;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ steps: stepCount }),
        };

    } catch (error) {
        console.error("Error fetching health data:", error.message);
        // If the error is because the user has no integration, return a success with no data.
        if (error.message.includes('No Google Health integration tokens found')) {
            return {
                statusCode: 200,
                body: JSON.stringify({ steps: null, message: 'No integration found.' }),
            };
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

// Use module.exports.config for Netlify to recognize it correctly.
module.exports.config = {
  timeout: 25,
};