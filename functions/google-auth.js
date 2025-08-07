const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const REDIRECT_URI = 'https://lightcorehealth.netlify.app/.netlify/functions/google-auth';

const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event, context) => {
    // If the 'code' and 'state' params are present, it's the callback from Google
    if (event.queryStringParameters.code && event.queryStringParameters.state) {
        return handleCallback(event);
    }
    // Otherwise, it's the initial request from our app to start the auth flow
    return startAuth(event);
};

async function startAuth(event) {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };
    }

    const supabaseUserClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };
    }

    // 1. Create a secure, random state value
    const state = crypto.randomBytes(16).toString('hex');
    const supabaseAdmin = createAdminClient();

    // 2. Store the state value with the user's ID
    const { error } = await supabaseAdmin.from('oauth_states').insert({
        state_value: state,
        user_id: user.id
    });

    if (error) {
        console.error('Error saving OAuth state:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Could not start authentication process.' }) };
    }

    const scopes = ['https://www.googleapis.com/auth/fitness.activity.read'];
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: scopes.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state: state // 3. Pass the state value to Google
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    // 4. Return the URL to the frontend
    return {
        statusCode: 200,
        body: JSON.stringify({ authUrl })
    };
}

async function handleCallback(event) {
    const { code, state } = event.queryStringParameters;
    if (!state) {
        throw new Error('State parameter missing.');
    }

    const supabaseAdmin = createAdminClient();

    // 1. Find the user ID associated with the returned state
    const { data: stateData, error: stateError } = await supabaseAdmin
        .from('oauth_states')
        .select('user_id')
        .eq('state_value', state)
        .single();

    if (stateError || !stateData) {
        throw new Error('Invalid or expired state token.');
    }

    const userId = stateData.user_id;

    // 2. Security: Immediately delete the state so it can't be reused
    await supabaseAdmin.from('oauth_states').delete().eq('state_value', state);

    // 3. Exchange the code for tokens
    const tokenResponse = await exchangeCodeForTokens(code);
    await saveTokensToSupabase(userId, tokenResponse);

    // 4. Redirect user back to the dashboard
    return {
        statusCode: 302,
        headers: { Location: 'https://lightcorehealth.netlify.app' }
    };
}

async function exchangeCodeForTokens(code) {
    const params = new URLSearchParams({
        code: code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
    });
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
    });
    const tokenData = await response.json();
    if (tokenData.error) {
        throw new Error(`Google token error: ${tokenData.error_description}`);
    }
    return tokenData;
}

async function saveTokensToSupabase(userId, tokenData) {
    const expires_at = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    const integrationData = {
        user_id: userId,
        provider: 'google-health',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expires_at,
    };
    
    const supabaseAdmin = createAdminClient();
    
    await supabaseAdmin.from('user_integrations').delete().eq('user_id', userId).eq('provider', 'google-health');
    const { error: insertError } = await supabaseAdmin.from('user_integrations').insert(integrationData);

    if (insertError) {
        throw new Error(`Supabase error saving tokens: ${insertError.message}`);
    }
}