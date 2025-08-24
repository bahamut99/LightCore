// netlify/functions/google-auth.js
// Handles Google Fit OAuth (start + callback) and saves tokens to Supabase.
// CHANGE: expires_at is now stored as EPOCH SECONDS (number), matching fetch-health-data's refresh logic.

const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// IMPORTANT: keep this in your Google Cloud Console OAuth credentials as an authorized redirect URI
const REDIRECT_URI = 'https://lightcorehealth.netlify.app/.netlify/functions/google-auth';

// Admin client (Service Role) for trusted writes
const createAdminClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Entry point: either kick off OAuth or handle the callback
exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  if (qs.code && qs.state) {
    return handleCallback(qs);
  }
  return startAuth(event);
};

// ----- Step 1: Start OAuth -----
async function startAuth(event) {
  // Require a valid user session (RLS-bound user client)
  const token = event.headers.authorization?.split(' ')[1];
  if (!token) {
    return json(401, { error: 'Not authorized.' });
  }

  const supabaseUser = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } = {} } = await supabaseUser.auth.getUser();
  if (!user) {
    return json(401, { error: 'User not found.' });
  }

  // Create one-time state and store it (tie to user)
  const state = crypto.randomBytes(16).toString('hex');
  const supabaseAdmin = createAdminClient();
  const { error: stateErr } = await supabaseAdmin
    .from('oauth_states')
    .insert({ state_value: state, user_id: user.id });

  if (stateErr) {
    console.error('Error saving OAuth state:', stateErr);
    return json(500, { error: 'Could not start authentication process.' });
  }

  // Request offline access so we get a refresh_token
  const scopes = ['https://www.googleapis.com/auth/fitness.activity.read'];
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline', // ensures refresh_token
    prompt: 'consent',      // always ask consent to guarantee refresh_token
    state,
  });

  return json(200, { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
}

// ----- Step 2: Handle Callback -----
async function handleCallback(qs) {
  const { code, state } = qs;
  if (!code || !state) {
    return redirect('/', 302);
  }

  const supabaseAdmin = createAdminClient();

  // Look up the user by state, then immediately delete the state (one-time use)
  const { data: stateRow, error: stateErr } = await supabaseAdmin
    .from('oauth_states')
    .select('user_id')
    .eq('state_value', state)
    .single();

  if (stateErr || !stateRow) {
    console.error('Invalid or expired OAuth state token.');
    return redirect('/', 302);
  }
  await supabaseAdmin.from('oauth_states').delete().eq('state_value', state);

  // Exchange code for tokens
  try {
    const tokenData = await exchangeCodeForTokens(code);

    // Save tokens to Supabase with expires_at as EPOCH SECONDS (number)
    await saveTokensToSupabase(supabaseAdmin, stateRow.user_id, tokenData);

    // Bounce the user back to the app
    return redirect('https://lightcorehealth.netlify.app', 302);
  } catch (e) {
    console.error('OAuth token exchange error:', e);
    return redirect('https://lightcorehealth.netlify.app', 302);
  }
}

// ----- Helpers -----
async function exchangeCodeForTokens(code) {
  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || 'Google token exchange failed.');
  }
  return data; // { access_token, refresh_token, expires_in, token_type, scope, ... }
}

async function saveTokensToSupabase(supabaseAdmin, userId, tokenData) {
  // Store expiry as a UNIX epoch seconds integer
  const expires_at = Math.floor(Date.now() / 1000) + Number(tokenData.expires_in || 0);

  const integrationData = {
    user_id: userId,
    provider: 'google-health',
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null, // may be null on subsequent consents
    expires_at, // <-- epoch seconds (number)
  };

  // Replace any existing google-health row for this user
  await supabaseAdmin.from('user_integrations').delete().eq('user_id', userId).eq('provider', 'google-health');

  const { error: insertErr } = await supabaseAdmin.from('user_integrations').insert(integrationData);
  if (insertErr) throw new Error(`Supabase insert error: ${insertErr.message}`);
}

// tiny response helpers
function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}
function redirect(url, status = 302) {
  return { statusCode: status, headers: { Location: url } };
}
