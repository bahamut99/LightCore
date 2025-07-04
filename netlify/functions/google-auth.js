const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const { createClient } = require('@supabase/supabase-js');

// Config
const REDIRECT_URI = 'https://lightcorehealth.netlify.app/.netlify/functions/google-auth';

exports.handler = async (event, context) => {
    // If the 'code' parameter is present, we are handling the callback.
    if (event.queryStringParameters.code) {
        return handleCallback(event);
    }
    // Otherwise, we are starting the auth process.
    return startAuth();
};

// --- Function to start the authentication flow ---
function startAuth() {
    const scopes = [
        'https://www.googleapis.com/auth/fitness.activity.read',
        'https://www.googleapis.com/auth/fitness.sleep.read',
        'https://www.googleapis.com/auth/fitness.blood_pressure.read',
        'https://www.googleapis.com/auth/fitness.blood_glucose.read'
    ];

    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: scopes.join(' '),
        access_type: 'offline',
        prompt: 'consent'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    // Redirect the user to Google
    return {
        statusCode: 302,
        headers: { Location: authUrl },
    };
}

// --- Function to handle the callback from Google ---
async function handleCallback(event) {
    const { code } = event.queryStringParameters;
    
    // The user's JWT is in the 'nf_jwt' cookie when they are logged in.
    const user_jwt = event.headers.cookie.split('; ').find(c => c.startsWith('nf_jwt='))?.split('=')[1];
    
    if (!user_jwt) {
        return { statusCode: 401, body: 'Not authorized.' };
    }

    try {
        const tokenResponse = await exchangeCodeForTokens(code);

        // Save tokens to our database, associated with the logged-in user.
        await saveTokensToSupabase(user_jwt, tokenResponse);
        
        // Redirect user back to the dashboard.
        return {
            statusCode: 302,
            headers: { Location: 'https://lightcorehealth.netlify.app' }
        };

    } catch (error) {
        console.error('Error in callback handler:', error);
        return { statusCode: 500, body: `An unexpected error occurred: ${error.message}` };
    }
}

// --- Helper to exchange the code for tokens ---
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

// --- Helper to save tokens to Supabase ---
async function saveTokensToSupabase(user_jwt, tokenData) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${user_jwt}` } }
    });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Could not find user.');

    const expires_at = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    const integrationData = {
        user_id: user.id,
        provider: 'google-health',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token, // May be null if user has already granted offline access
        expires_at: expires_at,
    };
    
    const { error } = await supabase
        .from('user_integrations')
        .upsert(integrationData, { onConflict: 'user_id, provider' });

    if (error) {
        throw new Error(`Supabase error saving tokens: ${error.message}`);
    }
}