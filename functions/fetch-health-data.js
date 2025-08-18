// netlify/functions/fetch-health-data.js
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Optional, only needed for token refresh
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export const handler = async (event) => {
  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return json(401, { error: 'Missing Authorization header' });
    }

    // Create RLS-bound client (uses the user's JWT)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
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

    // Refresh token if expired (if you store seconds since epoch in expires_at)
    if (expires_at && Date.now() > Number(expires_at) * 1000 && refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token,
          grant_type: 'refresh_token'
        })
      });
      if (refreshRes.ok) {
        const rjson = await refreshRes.json();
        access_token = rjson.access_token;

        // Try to persist the new token so next calls are fresh
        await supabase
          .from('user_integrations')
          .update({
            access_token: access_token,
            expires_at: rjson.expires_in ? Math.floor(Date.now() / 1000) + rjson.expires_in : null
          })
          .eq('provider', 'google-health');
      }
    }

    // Time zone handling
    const tz = event.queryStringParameters?.tz || 'UTC';
    const nowTz = DateTime.now().setZone(tz);
    const startMs = nowTz.startOf('day').toMillis();
    const endMs = nowTz.endOf('day').toMillis();

    // Ask Google Fit for today's steps in that local day window
    const aggRes = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName: 'com.google.step_count.delta' }],
        bucketByTime: { durationMillis: endMs - startMs },
        startTimeMillis: startMs,
        endTimeMillis: endMs
      })
    });

    if (!aggRes.ok) {
      const txt = await aggRes.text();
      return json(502, { error: 'Google API error', details: txt });
    }

    const aggJson = await aggRes.json();
    let steps = 0;
    for (const bucket of aggJson.bucket || []) {
      for (const ds of bucket.dataset || []) {
        for (const pt of ds.point || []) {
          const val = pt.value?.[0];
          if (val?.intVal != null) steps += val.intVal;
          else if (val?.fpVal != null) steps += Math.round(val.fpVal);
        }
      }
    }

    return json(200, { steps });
  } catch (err) {
    return json(500, { error: 'Server error', details: String(err) });
  }
};

// small helper
function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}
