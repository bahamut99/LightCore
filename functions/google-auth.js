// netlify/functions/google-auth.js
// Google Fit OAuth (start + callback) with safe token persistence.
// Fix: store expires_at as ISO (timestamptz-compatible) instead of epoch seconds.
// Also preserves existing refresh_token and uses UPSERT, with a fallback to delete+insert.

const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const REDIRECT_URI = 'https://lightcorehealth.netlify.app/.netlify/functions/google-auth';

const createAdminClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Entry point: start OAuth or handle callback
exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  if (qs.code && qs.state) return handleCallback(qs);
  return startAuth(event);
};

// ----- Start OAuth -----
async function startAuth(event) {
  const token = event.headers.authorization?.split(' ')[1];
  if (!token) return json(401, { error: 'Not authorized.' });

  const supabaseUser = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } = {} } = await supabaseUser.auth.getUser();
  if (!user) return json(401, { error: 'User not found.' });

  // One-time CSRF state
  const state = crypto.randomBytes(16).toString('hex');
  const supabaseAdmin = createAdminClient();
  const { error: stateErr } = await supabaseAdmin
    .from('oauth_states')
    .insert({ state_value: state, user_id: user.id });
  if (stateErr) {
    console.error('Error saving OAuth state:', stateErr);
    return json(500, { error: 'Could not start authentication process.' });
  }

  const scopes = ['https://www.googleapis.com/auth/fitness.activity.read'];
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return json(200, { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
}

// ----- Handle Callback -----
async function handleCallback(qs) {
  const { code, state } = qs;
  if (!code || !state) return redirect('https://lightcorehealth.netlify.app', 302);

  const supabaseAdmin = createAdminClient();

  // Validate + consume state
  const { data: stateRow, error: stateErr } = await supabaseAdmin
    .from('oauth_states')
    .select('user_id')
    .eq('state_value', state)
    .single();
  if (stateErr || !stateRow) {
    console.error('Invalid or expired OAuth state token.');
    return redirect('https://lightcorehealth.netlify.app', 302);
  }
  await supabaseAdmin.from('oauth_states').delete().eq('state_value', state);

  try {
    const tokenData = await exchangeCodeForTokens(code);
    await saveTokensToSupabase(supabaseAdmin, stateRow.user_id, tokenData);
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
  // data: { access_token, refresh_token?, expires_in, token_type, scope, ... }
  return data;
}

async function saveTokensToSupabase(supabaseAdmin, userId, tokenData) {
  // Preserve existing refresh_token if Google didn't return one this time
  const { data: existing } = await supabaseAdmin
    .from('user_integrations')
    .select('refresh_token')
    .eq('user_id', userId)
    .eq('provider', 'google-health')
    .maybeSingle();

  const refresh_token = tokenData.refresh_token || existing?.refresh_token || null;

  // Convert expires_in (seconds) -> ISO string for timestamptz column
  const expiresEpoch = Math.floor(Date.now() / 1000) + Number(tokenData.expires_in || 0);
  const expires_at = new Date(expiresEpoch * 1000).toISOString(); // <-- ISO string

  const row = {
    user_id: userId,
    provider: 'google-health',
    access_token: tokenData.access_token,
    refresh_token,
    expires_at, // ISO string for timestamptz
  };

  // Prefer UPSERT on (user_id, provider). If no unique constraint exists, fall back to delete+insert.
  const { error: upsertErr } = await supabaseAdmin
    .from('user_integrations')
    .upsert(row, { onConflict: 'user_id,provider' });

  if (upsertErr) {
    // If there's no unique constraint, do delete+insert
    const needsFallback =
      /no unique|constraint|on conflict/i.test(upsertErr.message || '');
    if (!needsFallback) {
      throw new Error(`Supabase upsert error: ${upsertErr.message}`);
    }
    await supabaseAdmin
      .from('user_integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'google-health');
    const { error: insertErr } = await supabaseAdmin
      .from('user_integrations')
      .insert(row);
    if (insertErr) throw new Error(`Supabase insert error: ${insertErr.message}`);
  }
}

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
