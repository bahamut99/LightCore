// netlify/functions/fetch-health-data.js
// Fetch today's Google Fit steps for the signed-in user (Classic View).
// Improvements:
// - Accepts expires_at as EPOCH SECONDS or ISO string
// - Refreshes tokens (with timeout) and persists new expiry as epoch seconds
// - One retry on 401, 10s request timeouts, better errors

const { createClient } = require('@supabase/supabase-js');
const { DateTime } = require('luxon');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

exports.handler = async (event) => {
  try {
    const authHeader =
      event.headers?.authorization ||
      event.headers?.Authorization ||
      event.headers?.AUTHORIZATION;

    if (!authHeader) return json(401, { error: 'Missing Authorization header' });

    // Support both "Bearer x" and raw tokens defensively
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : authHeader;

    // RLS-bound client (user context)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Find the user's Google integration row
    const { data: integration, error: integErr } = await supabase
      .from('user_integrations')
      .select('access_token, refresh_token, expires_at')
      .eq('provider', 'google-health')
      .maybeSingle();

    if (integErr || !integration) {
      return json(404, { error: 'Google Health not connected' });
    }

    let { access_token, refresh_token, expires_at } = integration;

    // Normalize expires_at (epoch seconds preferred; allow legacy ISO)
    let expSecs = Number(expires_at);
    if (!Number.isFinite(expSecs) && typeof expires_at === 'string') {
      const parsed = Date.parse(expires_at);
      if (!Number.isNaN(parsed)) expSecs = Math.floor(parsed / 1000);
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    const skew = 60; // 1 min skew protection
    const needsRefresh =
      !!expSecs &&
      nowSecs >= expSecs - skew &&
      !!refresh_token &&
      !!GOOGLE_CLIENT_ID &&
      !!GOOGLE_CLIENT_SECRET;

    if (needsRefresh) {
      const refreshed = await refreshGoogleToken(refresh_token);
      if (refreshed?.access_token) {
        access_token = refreshed.access_token;
        const newExpSecs = refreshed.expires_in
          ? nowSecs + Number(refreshed.expires_in)
          : null;

        await supabase
          .from('user_integrations')
          .update({
            access_token,
            expires_at: newExpSecs, // store epoch seconds going forward
          })
          .eq('provider', 'google-health');
      }
    }

    const tz = event.queryStringParameters?.tz || 'UTC';
    const { startMs, endMs } = dayBoundsInTZ(tz);

    // First attempt
    let { steps, resStatus } = await fetchSteps(access_token, startMs, endMs);

    // If unauthorized, try one last refresh-and-retry (covers legacy rows w/o good expiry)
    if (
      (resStatus === 401 || resStatus === 403) &&
      refresh_token &&
      GOOGLE_CLIENT_ID &&
      GOOGLE_CLIENT_SECRET
    ) {
      const refreshed = await refreshGoogleToken(refresh_token);
      if (refreshed?.access_token) {
        access_token = refreshed.access_token;
        const newExpSecs = refreshed.expires_in
          ? Math.floor(Date.now() / 1000) + Number(refreshed.expires_in)
          : null;

        await supabase
          .from('user_integrations')
          .update({
            access_token,
            expires_at: newExpSecs,
          })
          .eq('provider', 'google-health');

        const retry = await fetchSteps(access_token, startMs, endMs);
        steps = retry.steps;
        resStatus = retry.resStatus;
      }
    }

    if (steps != null) return json(200, { steps });
    if (resStatus === 401 || resStatus === 403)
      return json(401, { error: 'Google token expired' });
    if (resStatus) return json(502, { error: 'Google API error' });

    return json(500, { error: 'Unknown error' });
  } catch (err) {
    return json(500, { error: 'Server error', details: String(err) });
  }
};

// --- helpers ---

function dayBoundsInTZ(tz) {
  const now = DateTime.now().setZone(tz);
  return {
    startMs: now.startOf('day').toMillis(),
    endMs: now.endOf('day').toMillis(),
  };
}

async function fetchSteps(accessToken, startMs, endMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    const res = await fetch(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          aggregateBy: [{ dataTypeName: 'com.google.step_count.delta' }],
          bucketByTime: { durationMillis: endMs - startMs },
          startTimeMillis: startMs,
          endTimeMillis: endMs,
        }),
      }
    );

    clearTimeout(t);

    if (!res.ok) {
      return { steps: null, resStatus: res.status };
    }

    const agg = await res.json();
    let steps = 0;
    for (const bucket of agg.bucket || []) {
      for (const ds of bucket.dataset || []) {
        for (const pt of ds.point || []) {
          const v = pt.value?.[0];
          if (v?.intVal != null) steps += v.intVal;
          else if (v?.fpVal != null) steps += Math.round(v.fpVal);
        }
      }
    }
    return { steps, resStatus: 200 };
  } catch {
    clearTimeout(t);
    return { steps: null, resStatus: 0 };
  }
}

async function refreshGoogleToken(refreshToken) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(t);
    return null;
  }
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}
