// netlify/functions/fetch-health-data.js
// Quiet step fetcher: never leaks errors to users; timezone-aware.
// Returns: 200 { steps: number } in all cases.

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// helper: permissive CORS for your app origin
const json = (status, body) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});

  // Always be quiet to the browser
  const safeReturn = (n) => json(200, { steps: Number.isFinite(n) && n >= 0 ? n : 0 });

  try {
    // 1) Read auth (supabase JWT) if present; not strictly required for a quiet response
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 2) Input window
    const url = new URL(event.rawUrl || `https://x.example${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
    const tz = url.searchParams.get('tz') || 'UTC';
    const fromParam = url.searchParams.get('from'); // optional client-computed ms
    const now = Date.now();

    // compute midnight in requested tz (fallback if 'from' not provided)
    const startMs = fromParam
      ? Math.min(Math.max(0, Number(fromParam)), now)
      : (() => {
          // lightweight tz start-of-day:
          const nowLocalInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
          const tzMid = new Date(nowLocalInTz.getFullYear(), nowLocalInTz.getMonth(), nowLocalInTz.getDate());
          // Align that "calendar midnight" back to UTC by compensating the difference between
          // the server clock and the tz wall time we just created
          const diff = nowLocalInTz.getTime() - Date.now();
          return tzMid.getTime() - diff;
        })();

    // 3) Look up OAuth tokens (Google Fit) from your `user_integrations` table
    //    If you keep tokens elsewhere, adjust this query to match your schema.
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    let userId = null;
    try {
      const { data, error } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
      if (data?.user?.id) userId = data.user.id;
    } catch (_) {
      // ignore; we’ll just return 0 quietly
    }

    if (!userId) {
      // no session -> just return 0 quietly
      return safeReturn(0);
    }

    const { data: integRow } = await supabase
      .from('user_integrations')
      .select('provider, access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .maybeSingle();

    if (!integRow?.access_token) {
      return safeReturn(0);
    }

    // 4) Refresh token if needed
    let accessToken = integRow.access_token;
    const exp = Number(integRow.expires_at || 0) * 1000;
    if (!exp || exp < Date.now() + 60_000) {
      try {
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: integRow.refresh_token || '',
          }),
        });
        if (r.ok) {
          const j = await r.json();
          if (j.access_token) {
            accessToken = j.access_token;
            const newExp = j.expires_in ? Math.floor(Date.now() / 1000) + Number(j.expires_in) : null;
            await supabase
              .from('user_integrations')
              .update({ access_token: accessToken, expires_at: newExp })
              .eq('user_id', userId)
              .eq('provider', 'google');
          }
        }
      } catch (_) {
        // ignore and try with existing token
      }
    }

    // 5) Google Fit steps aggregated for [startMs, now]
    //    Using the Dataset endpoint; times must be in nanoseconds
    const startNs = String(Math.max(0, Math.floor(startMs)) * 1_000_000);
    const endNs = String(Math.floor(now) * 1_000_000);
    const ds =
      'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps';

    const fitUrl = `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`;
    const body = {
      aggregateBy: [{ dataSourceId: `derived:com.google.step_count.delta:com.google.android.gms:estimated_steps` }],
      bucketByTime: { durationMillis: now - startMs },
      startTimeMillis: Math.floor(startMs),
      endTimeMillis: Math.floor(now),
    };

    let stepsTotal = 0;
    try {
      const r = await fetch(fitUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const j = await r.json();
        const buckets = Array.isArray(j.bucket) ? j.bucket : [];
        for (const b of buckets) {
          const sets = Array.isArray(b.dataset) ? b.dataset : [];
          for (const s of sets) {
            const points = Array.isArray(s.point) ? s.point : [];
            for (const p of points) {
              const v = p.value?.[0]?.intVal ?? 0;
              stepsTotal += Number(v || 0);
            }
          }
        }
      } else {
        // silently fall back
        return safeReturn(0);
      }
    } catch (_) {
      return safeReturn(0);
    }

    return safeReturn(stepsTotal);
  } catch (_) {
    return safeReturn(0);
  }
};
