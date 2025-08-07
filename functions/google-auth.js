const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const { createClient } = require('@supabase/supabase-js');

const REDIRECT_URI = 'https://lightcorehealth.netlify.app/.netlify/functions/google-auth';

const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event, context) => {
    if (event.queryStringParameters.code) {
        return handleCallback(event);
    }
    return startAuth();
};

function startAuth() {
    // This part is for the initial redirect TO Google
    const scopes = [
        'https://www.googleapis.com/auth/fitness.activity.read'
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
    return { statusCode: 302, headers: { Location: authUrl } };
}

async function handleCallback(event) {
    // THIS IS THE NEW, CRITICAL LOG
    console.log('--- GOOGLE AUTH CALLBACK INITIATED ---');

    const { code } = event.queryStringParameters;
    const cookieHeader = event.headers.cookie || '';
    const user_jwt = cookieHeader.split('; ').find(c => c.startsWith('nf_jwt='))?.split('=')[1];
    
    if (!user_jwt) {
        console.error('Callback error: Netlify JWT not found.');
        return { statusCode: 302, headers: { Location: 'https://lightcorehealth.netlify.app' } };
    }

    try {
        const tokenResponse = await exchangeCodeForTokens(code);
        await saveTokensToSupabase(user_jwt, tokenResponse);
        return { statusCode: 302, headers: { Location: 'https://lightcorehealth.netlify.app' } };
    } catch (error) {
        console.error('Error in callback handler:', error);
        return { statusCode: 500, body: `An unexpected error occurred: ${error.message}` };
    }
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

async function saveTokensToSupabase(user_jwt, tokenData) {
    const supabaseUserClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${user_jwt}` } }
    });
    
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user) throw new Error('Could not find user.');

    const expires_at = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    const integrationData = {
        user_id: user.id,
        provider: 'google-health',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expires_at,
    };
    
    const supabaseAdmin = createAdminClient();
    
    const { error: deleteError } = await supabaseAdmin
        .from('user_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'google-health');

    if (deleteError) {
        console.error('[DEBUG] Supabase delete error:', deleteError.message);
        throw new Error(`Supabase delete error: ${deleteError.message}`);
    }

    const { error: insertError } = await supabaseAdmin
        .from('user_integrations')
        .insert(integrationData);

    if (insertError) {
        console.error('[DEBUG] Supabase insert error:', insertError.message);
        throw new Error(`Supabase error saving tokens: ${insertError.message}`);
    } else {
        console.log(`[DEBUG] Successfully saved tokens for user ${user.id}`);
    }
}