// netlify/functions/fetch-health-data.js
// Near-live Google Fit steps for "today" in the user's timezone.
//
// Changes:
// - Default mode is DATASET-ONLY: reads merged raw step deltas for the entire day
//   (start-of-day -> now) to minimize Google aggregate caching lag.
// - Keeps token auto-refresh with retry, 10s timeouts, strict no-store caching.
// - Optional `mode=hybrid` query param brings back the old hybrid method if needed.
// - Accepts `tz=America/Chicago` (defaults UTC).

const { createClient } = require("@supabase/supabase-js");
const { DateTime } = require("luxon");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

exports.handler = async (event) => {
  try {
    // ---- Auth header ----
    const authHeader =
      event.headers?.authorization ||
      event.headers?.Authorization ||
      event.headers?.AUTHORIZATION;
    if (!authHeader) return json(401, { error: "Missing Authorization header" });

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : authHeader;

    // ---- Supabase user client (RLS context) ----
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // ---- Integration row ----
    const { data: integration, error: integErr } = await supabase
      .from("user_integrations")
      .select("access_token, refresh_token, expires_at")
      .eq("provider", "google-health")
      .maybeSingle();

    if (integErr || !integration) {
      return json(404, { error: "Google Health not connected" });
    }

    let { access_token, refresh_token, expires_at } = integration;

    // ---- Normalize expiry (epoch seconds preferred; accept legacy ISO) ----
    let expSecs = Number(expires_at);
    if (!Number.isFinite(expSecs) && typeof expires_at === "string") {
      const parsed = Date.parse(expires_at);
      if (!Number.isNaN(parsed)) expSecs = Math.floor(parsed / 1000);
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    const skew = 60; // refresh one minute early
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
          .from("user_integrations")
          .update({
            access_token,
            expires_at: newExpSecs, // store epoch seconds
          })
          .eq("provider", "google-health");
      }
    }

    // ---- Time window and mode ----
    const tz = event.queryStringParameters?.tz || "UTC";
    const mode = (event.queryStringParameters?.mode || "dataset").toLowerCase();

    const now = DateTime.now().setZone(tz);
    const startMs = now.startOf("day").toMillis();
    const endMs = now.toMillis();

    let result;

    if (mode === "hybrid") {
      // previous behavior (aggregate up to now - liveWindow, dataset for recent minutes)
      const liveWindowParam = event.queryStringParameters?.liveWindow;
      let liveWindowMin = Number.isFinite(Number(liveWindowParam))
        ? Math.max(5, Math.min(30, parseInt(liveWindowParam, 10)))
        : 10;

      const windowStartMs = Math.max(startMs, endMs - liveWindowMin * 60 * 1000);
      const [agg, live] = await Promise.all([
        windowStartMs > startMs
          ? fetchAggregateSteps(access_token, startMs, windowStartMs)
          : Promise.resolve({ steps: 0, resStatus: 200 }),
        fetchDatasetSteps(access_token, windowStartMs, endMs),
      ]);

      if (
        (agg.resStatus === 401 || agg.resStatus === 403 || live.resStatus === 401 || live.resStatus === 403) &&
        refresh_token
      ) {
        const refreshed = await refreshGoogleToken(refresh_token);
        if (refreshed?.access_token) {
          access_token = refreshed.access_token;
          const newExpSecs = refreshed.expires_in
            ? Math.floor(Date.now() / 1000) + Number(refreshed.expires_in)
            : null;

          await supabase
            .from("user_integrations")
            .update({ access_token, expires_at: newExpSecs })
            .eq("provider", "google-health");

          const retry = await Promise.all([
            windowStartMs > startMs
              ? fetchAggregateSteps(access_token, startMs, windowStartMs)
              : Promise.resolve({ steps: 0, resStatus: 200 }),
            fetchDatasetSteps(access_token, windowStartMs, endMs),
          ]);
          result = { steps: (retry[0].steps || 0) + (retry[1].steps || 0) };
        }
      }

      if (!result) {
        if ((agg.resStatus && agg.resStatus !== 200) || (live.resStatus && live.resStatus !== 200)) {
          return json(502, { error: "Google API error (hybrid)" });
        }
        result = { steps: (agg.steps || 0) + (live.steps || 0) };
      }
    } else {
      // DATASET-ONLY: read merged raw steps for the whole day
      let ds = await fetchDatasetSteps(access_token, startMs, endMs);

      if ((ds.resStatus === 401 || ds.resStatus === 403) && refresh_token) {
        const refreshed = await refreshGoogleToken(refresh_token);
        if (refreshed?.access_token) {
          access_token = refreshed.access_token;
          const newExpSecs = refreshed.expires_in
            ? Math.floor(Date.now() / 1000) + Number(refreshed.expires_in)
            : null;

          await supabase
            .from("user_integrations")
            .update({ access_token, expires_at: newExpSecs })
            .eq("provider", "google-health");

          ds = await fetchDatasetSteps(access_token, startMs, endMs);
        }
      }

      if (ds.resStatus && ds.resStatus !== 200) {
        return json(502, { error: "Google dataset API error" });
      }
      result = { steps: ds.steps || 0 };
    }

    return json(200, { steps: result.steps, tz, mode: mode === "hybrid" ? "hybrid" : "dataset" });
  } catch (err) {
    return json(500, { error: "Server error", details: String(err) });
  }
};

// ---------- Helpers ----------

// Aggregate steps between [startMs, endMs)
async function fetchAggregateSteps(accessToken, startMs, endMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
        body: JSON.stringify({
          aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
          bucketByTime: { durationMillis: Math.max(1, endMs - startMs) },
          startTimeMillis: startMs,
          endTimeMillis: endMs,
        }),
      }
    );
    clearTimeout(t);
    if (!res.ok) return { steps: null, resStatus: res.status };

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

// Read merged raw step deltas between [startMs, endMs)
async function fetchDatasetSteps(accessToken, startMs, endMs) {
  // datasetId => nanoseconds
  const startNs = BigInt(startMs) * 1000000n;
  const endNs = BigInt(Math.max(endMs, startMs + 1)) * 1000000n;
  const datasetId = `${startNs}-${endNs}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas/datasets/${datasetId}`,
      {
        method: "GET",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      }
    );
    clearTimeout(t);
    if (!res.ok) return { steps: null, resStatus: res.status };

    const data = await res.json();
    let steps = 0;
    for (const pt of data.point || []) {
      const v = pt.value?.[0];
      if (v?.intVal != null) steps += v.intVal;
      else if (v?.fpVal != null) steps += Math.round(v.fpVal);
    }
    return { steps, resStatus: 200 };
  } catch {
    clearTimeout(t);
    return { steps: null, resStatus: 0 };
  }
}

async function refreshGoogleToken(refreshToken) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
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
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
    body: JSON.stringify(body),
  };
}

