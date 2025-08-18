// netlify/functions/fetch-health-data.js
//
// Hardened version:
// - Always returns 200 with { steps } so the UI never shows errors
// - Uses the client-supplied IANA timezone (?tz=America/Los_Angeles) for *today*
// - Verifies the Supabase user from the bearer token and reads that user's Google tokens
// - Tries Google Fit aggregate; on any failure, falls back to { steps: 0 } (stale-safe)
// - Sets Cache-Control: no-store to avoid caching stale values

import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

// --- Config from environment ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; // Works with RLS if your policies allow user to read their own integration row

// Optional (only needed for refresh flow; function still works without it)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

// Table/column assumptions (adjust if your schema differs)
const INTEGRATIONS_TABLE = "user_integrations";
// Either `provider: 'google'` or `'google_fit'` — include both to be safe
const PROVIDERS = ["google", "google_fit"];

export async function handler(event) {
  const safeJson = (status, body) => ({
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  });

  try {
    // ---------- 1) Basic request parsing ----------
    const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
    const tzParam = (event.queryStringParameters?.tz || "UTC").trim();

    // naive tz validation — allow letters, slash, underscore only
    const tz = /^[A-Za-z_/-]+$/.test(tzParam) ? tzParam : "UTC";

    // ---------- 2) Supabase: verify user (via the same JWT you use on the client) ----------
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      // Misconfig shouldn't break UX
      return safeJson(200, { steps: 0, stale: true });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return safeJson(200, { steps: 0, stale: true });
    }
    const userId = userData.user.id;

    // ---------- 3) Pull Google tokens from your integration table (RLS should allow own-row read) ----------
    const { data: integrations, error: integErr } = await supabase
      .from(INTEGRATIONS_TABLE)
      .select("provider, access_token, refresh_token, expires_at")
      .eq("id", userId);

    if (integErr || !integrations || integrations.length === 0) {
      return safeJson(200, { steps: 0, stale: true });
    }

    // Pick the first Google-like provider row with an access token
    const row =
      integrations.find((r) => PROVIDERS.includes(String(r.provider))) ||
      integrations[0];

    let accessToken = row?.access_token || "";
    const refreshToken = row?.refresh_token || "";
    const expiresAt = row?.expires_at ? Number(row.expires_at) : 0;

    if (!accessToken) {
      return safeJson(200, { steps: 0, stale: true });
    }

    // ---------- 4) Refresh token if clearly expired and we have client/secret ----------
    const nowSec = Math.floor(Date.now() / 1000);
    const isExpired = expiresAt && expiresAt <= nowSec + 60; // 1-minute grace

    if (isExpired && refreshToken && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
      try {
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });

        if (refreshRes.ok) {
          const refreshJson = await refreshRes.json();
          if (refreshJson?.access_token) {
            accessToken = refreshJson.access_token;

            // Optionally persist new tokens (ignore failures; UX should stay smooth)
            await supabase
              .from(INTEGRATIONS_TABLE)
              .update({
                access_token: accessToken,
                expires_at: refreshJson.expires_in
                  ? Math.floor(Date.now() / 1000) + Number(refreshJson.expires_in)
                  : expiresAt,
              })
              .eq("id", userId)
              .eq("provider", row.provider);
          }
        }
      } catch {
        // Ignore refresh errors; fall back to stale-safe
      }
    }

    // ---------- 5) Compute today window in the user's IANA timezone ----------
    const { startMs, endMs } = getTodayBoundsInTZ(tz);

    // ---------- 6) Google Fit aggregate for steps ----------
    // Using derived estimated steps source; if not available on the account, Google will still aggregate com.google.step_count.delta
    const aggregateUrl =
      "https://fitness.googleapis.com/fitness/v1/users/me/dataset:aggregate";

    const payload = {
      aggregateBy: [
        {
          dataTypeName: "com.google.step_count.delta",
          // dataSourceId optional; leaving it off lets Google choose valid sources
          // dataSourceId:
          //   "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
        },
      ],
      bucketByTime: { durationMillis: endMs - startMs },
      startTimeMillis: startMs,
      endTimeMillis: endMs,
    };

    const fitRes = await fetch(aggregateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!fitRes.ok) {
      // Swallow the error and return 0 — we never want a 5xx back to the client
      return safeJson(200, { steps: 0, stale: true });
    }

    const fitJson = await fitRes.json();
    const steps = sumStepsFromAggregate(fitJson);

    return safeJson(200, {
      steps: Number.isFinite(steps) ? steps : 0,
      tz,
      range: { start: startMs, end: endMs },
    });
  } catch {
    // Final safety net: never surface errors
    return safeJson(200, { steps: 0, stale: true });
  }
}

/* ---------------- Helpers ---------------- */

/**
 * Sums steps from Google Fit aggregate response.
 */
function sumStepsFromAggregate(agg) {
  if (!agg || !Array.isArray(agg.bucket)) return 0;
  let total = 0;
  for (const b of agg.bucket) {
    if (!Array.isArray(b.dataset)) continue;
    for (const ds of b.dataset) {
      if (!Array.isArray(ds.point)) continue;
      for (const p of ds.point) {
        if (!Array.isArray(p.value)) continue;
        for (const v of p.value) {
          // intVal or fpVal may be present depending on account/source
          const val =
            (typeof v.intVal === "number" && v.intVal) ||
            (typeof v.fpVal === "number" && Math.round(v.fpVal)) ||
            0;
          total += val;
        }
      }
    }
  }
  return total;
}

/**
 * Returns start/end of "today" in the target IANA timezone as epoch millis.
 * Works without external libs by computing the timezone offset at midnight via Intl.
 */
function getTodayBoundsInTZ(timeZone) {
  const now = new Date();

  // Get Y/M/D in the target TZ
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});

  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);

  // Compute the UTC instant that corresponds to 00:00:00 in the target TZ
  const startUtcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offsetAtStart = tzOffsetAtInstant(startUtcGuess, timeZone);
  const startMs = startUtcGuess - offsetAtStart;

  // Next midnight
  const nextUtcGuess = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  const offsetAtNext = tzOffsetAtInstant(nextUtcGuess, timeZone);
  const endMs = nextUtcGuess - offsetAtNext;

  return { startMs, endMs };
}

/**
 * Finds the timezone offset in milliseconds for a given UTC instant in an IANA timezone.
 * Positive result means "ahead of UTC".
 */
function tzOffsetAtInstant(utcMs, timeZone) {
  // Represent the given UTC instant in the target TZ, then read what the local wall clock says.
  const dt = new Date(utcMs);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(dt)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});

  // Interpret that wall-clock time as *UTC* and see the difference
  const asIfUtc = Date.parse(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`
  );

  // offset = (wall-clock-as-UTC) - (actual UTC)
  return asIfUtc - utcMs;
}
