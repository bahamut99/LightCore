// netlify/functions/get-dashboard-data.js
// Classic dashboard data loader (no external AI calls here)
// - Works with your current tables/columns
// - Computes distinct log-days for Lightcore Guide progress
// - Returns: weeklySummaryData, chronoDeckData, nudgeData,
//            recentEntriesData, lightcoreGuideData, logCount

const { createClient } = require('@supabase/supabase-js');

// ---------- helpers ----------
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

function dayKey(dateLike, tz) {
  // stable yyyy-mm-dd key in a specific timezone
  const d = new Date(dateLike);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function startOfLocalDay(ts, tz) {
  const d = new Date(ts);
  // Get yyyy-mm-dd string in tz, then rebuild a Date at 00:00 tz.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const da = parts.find(p => p.type === 'day').value;
  // Construct local-like 00:00 by parsing as ISO (which is UTC),
  // then offset effect is OK since we only use comparisons with the same formatter.
  return new Date(`${y}-${m}-${da}T00:00:00Z`);
}

// Count unique local days (cap to needed window for efficiency)
function countDistinctDays(rows, tz) {
  const set = new Set();
  for (const r of rows || []) set.add(dayKey(r.created_at, tz));
  return set.size;
}

// ---------- main ----------
exports.handler = async (event) => {
  try {
    const authHeader =
      event.headers?.authorization ||
      event.headers?.Authorization ||
      event.headers?.AUTHORIZATION;

    if (!authHeader) return json(401, { error: 'Missing Authorization header' });

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : authHeader;

    const tz = event.queryStringParameters?.tz || 'UTC';

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // who is the user?
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) return json(401, { error: 'Not signed in' });
    const userId = userRes.user.id;

    // -------- recent entries (only columns that exist) --------
    const { data: recentEntries, error: recentErr } = await supabase
      .from('daily_logs')
      .select(
        [
          'id',
          'created_at',
          'log',
          'clarity_score',
          'clarity_label',
          'clarity_color',
          'immune_score',
          'immune_label',
          'immune_color',
          'physical_readiness_score',
          'physical_readiness_label',
          'physical_readiness_color',
          'sleep_hours',
          'sleep_quality',
          'ai_notes',
        ].join(', ')
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentErr) {
      console.error('Error fetching recent entries:', recentErr.message);
    }

    // -------- log-day counts (for unlock/progress) --------
    // Pull enough rows to cover 30+ days; 400 is plenty and still light.
    const { data: forCounts } = await supabase
      .from('daily_logs')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(400);

    const totalDistinctDays = countDistinctDays(forCounts || [], tz);

    // Last 7 local days for weekly progress
    const now = new Date();
    const todayStart = startOfLocalDay(now, tz);
    const weekStart = new Date(todayStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6); // inclusive 7-day window

    const daysThisWeek = new Set();
    for (const r of (forCounts || [])) {
      const created = new Date(r.created_at);
      // compare by local-day range using keys
      const key = dayKey(created, tz);
      // Only include keys whose midnight is >= weekStart
      const keyStart = startOfLocalDay(created, tz);
      if (keyStart >= weekStart && keyStart <= todayStart) daysThisWeek.add(key);
    }
    const progressThisWeek = daysThisWeek.size;

    // -------- weekly goal (safe default if none) --------
    let goalValue = 6;
    try {
      const { data: goalRow } = await supabase
        .from('goals')
        .select('goal_value, is_active, goal_type')
        .eq('user_id', userId)
        .eq('goal_type', 'log_frequency')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (goalRow?.goal_value) goalValue = Number(goalRow.goal_value) || 6;
    } catch (_) {
      /* fall back to default */
    }

    const weeklySummaryData = {
      progress: progressThisWeek,
      goal: { goal_value: goalValue },
    };

    // -------- ChronoDeck (events for the past ~7 days) --------
    // Your events table stores event_time + event_type (and maybe color)
    let chronoDeckData = [];
    try {
      const { data: events } = await supabase
        .from('events')
        .select('id, event_time, event_type, event_color')
        .eq('user_id', userId)
        .gte('event_time', weekStart.toISOString())
        .order('event_time', { ascending: true })
        .limit(250);
      chronoDeckData = events || [];
    } catch (_) {
      chronoDeckData = [];
    }

    // -------- Nudge (latest, unacknowledged) --------
    let nudgeData = null;
    try {
      const { data: nudge } = await supabase
        .from('nudges')
        .select('id, headline, body_text, suggested_actions, is_acknowledged, created_at')
        .eq('user_id', userId)
        .eq('is_acknowledged', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      nudgeData = nudge || null;
    } catch (_) {
      nudgeData = null;
    }

    // -------- Lightcore Guide (cached guidance or stub from brain_context) --------
    let lightcoreGuideData = null;

    // Try cache first
    try {
      const { data: cacheRow } = await supabase
        .from('lightcore_guidance_cache')
        .select('guidance') // guidance JSONB
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cacheRow?.guidance?.guidance_for_user) {
        // Expected shape from generate-guidance.js
        const g = cacheRow.guidance.guidance_for_user;
        lightcoreGuideData = {
          current_state: g.current_state || '',
          positives: Array.isArray(g.positives) ? g.positives : [],
          concerns: Array.isArray(g.concerns) ? g.concerns : [],
          suggestions: Array.isArray(g.suggestions) ? g.suggestions : [],
        };
      }
    } catch (_) {
      /* fall through */
    }

    // Fallback to brain_context.user_summary if cache missing
    if (!lightcoreGuideData) {
      try {
        const { data: bc } = await supabase
          .from('lightcore_brain_context')
          .select('user_summary, recent_insights')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();

        lightcoreGuideData = {
          current_state: bc?.user_summary || 'Unable to load guidance.',
          positives: [],
          concerns: [],
          suggestions: [],
        };

        // If you ever store arrays in recent_insights, fold them in:
        if (bc?.recent_insights && Array.isArray(bc.recent_insights)) {
          // treat as past one-liners; do not surface directly to UI sections
        }
      } catch (_) {
        lightcoreGuideData = {
          current_state: 'Unable to load guidance.',
          positives: [],
          concerns: [],
          suggestions: [],
        };
      }
    }

    // ---------- respond ----------
    return json(200, {
      weeklySummaryData,
      chronoDeckData,
      nudgeData,
      recentEntriesData: recentEntries || [],
      lightcoreGuideData,
      logCount: totalDistinctDays, // for the unlock timeline (1/30…)
    });
  } catch (err) {
    console.error('get-dashboard-data fatal:', err);
    return json(500, { error: 'Server error' });
  }
};

