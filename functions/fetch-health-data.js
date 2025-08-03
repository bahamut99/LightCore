const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const { createClient } = require('@supabase/supabase-js');

async function getValidAccessToken(supabase, userId) {
    let { data: tokens, error } = await supabase
        .from('user_integrations')
        .select('access_token, refresh_token, expires_at')
        .eq('user_id', userId)
        .eq('provider', 'google-health')
        .single();

    if (error) throw new Error('No Google Health integration tokens found for this user.');

    if (new Date(tokens.expires_at) > new Date()) {
        return tokens.access_token;
    }

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

exports.handler = async (event, context) => {
    try {
        if (!event.headers.authorization) throw new Error('No auth header');
        const token = event.headers.authorization.split(' ')[1];

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) throw new Error('User not found for provided token.');
        
        const accessToken = await getValidAccessToken(supabase, user.id);

        const now = new Date();
        const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

        const requestBody = {
            aggregateBy: [{
                dataTypeName: "com.google.step_count.delta",
                dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
            }],
            bucketByTime: { durationMillis: 86400000 },
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
        if (fitnessData.bucket && fitnessData.bucket.length > 0 && fitnessData.bucket[0].dataset[0].point.length > 0) {
            stepCount = fitnessData.bucket[0].dataset[0].point[0].value[0].intVal;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ steps: stepCount }),
        };

    } catch (error) {
        console.error("Error fetching health data:", error.message);
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