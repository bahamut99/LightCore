// netlify/functions/get-dashboard-data.js
// Returns all dashboard data in one request.
// CHANGE: logCount now counts UNIQUE DAYS with at least one log (timezone-aware).

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// RLS-bound (user) client
function createUserClient(jwt) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

// (Optional) Admin client if you later need trusted reads/writes
const createAdminClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/* ---------------- Time helpers (timezone-safe) ---------------- */

function getLocalNow(tz) {
  // Date whose wall clock equals "now" in tz
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
}

function startOfLocalWeek(tz) {
  const now = getLocalNow(tz);
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay()); // Sunday start
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfLocalWeek(tz) {
  const start = startOfLocalWeek(tz);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return end;
}

function toLocalDayKey(isoString, tz) {
  // "YYYY-MM-DD" for the given timezone
  return new Date(isoString).toLocaleDateString('en-CA', { timeZone: tz });
}

/* ---------------- Feature helpers ---------------- */

// 1) Distinct days logged (NOT total logs)
async function fetchDistinctDayCount(supabaseUser, userId, userTimezone) {
  try {
    const { data, error } = await supabaseUser
      .from('daily_logs')
      .select('created_at')
      .eq('user_id', userId);

    if (error) throw error;

    const days = new Set();
    (data || []).forEach((row) => days.add(toLocalDayKey(row.created_at, userTimezone)));
    return days.size;
  } catch (e) {
    console.error('Error fetching distinct-day log count:', e.message);
    return 0;
  }
}

// 2) Weekly summary: active goal + progress = unique days logged this week
async function fetchWeeklySummary(supabaseUser, userId, userTimezone) {
  try {
    // Active goal
    const { data: goal, error: goalErr } = await supabaseUser
      .from('goals')
      .select('id, goal_value, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    // Logs inside this local week
    const startISO = startOfLocalWeek(userTimezone).toISOString();
    const endISO = endOfLocalWeek(userTimezone).toISOString();

    const { data: logs, error: logsErr } = await supabaseUser
      .from('daily_logs')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', startISO)
      .lt('created_at', endISO);

    if (goalErr) console.error('Goal fetch error (weekly summary):', goalErr.message);
    if (logsErr) console.error('Logs fetch error (weekly summary):', logsErr.message);

    const days = new Set();
    (logs || []).forEach((row) => days.add(toLocalDayKey(row.created_at, userTimezone)));

    return {
      goal: goal || null,
      progress: days.size,   // fill this many dots
      daysLogged: days.size, // convenience
    };
  } catch (e) {
    console.error('Error in fetchWeeklySummary:', e.message);
    return { goal: null, progress: 0, daysLogged: 0 };
  }
}

// 3) Active nudge (if any)
async function fetchNudge(supabaseUser, userId) {
  try {
    const { data, error } = await supabaseUser
      .from('nudges')
      .select('*')
      .eq('user_id', userId)
      .eq('is_acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return (data && data[0]) || null;
  } catch (e) {
    console.error('Error fetching nudge:', e.message);
    return null;
  }
}

// 4) Recent entries (latest 10)
async function fetchRecentEntries(supabaseUser, userId) {
  try {
    const { data, error } = await supabaseUser
      .from('daily_logs')
      .select(
        'id, created_at, log, clarity_score, immune_score, physical_readiness_score, clarity_label, immune_label, physical_label, notes'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Error fetching recent entries:', e.message);
    return [];
  }
}

// 5) Lightcore guide (pull stored context if present; otherwise fallback)
async function fetchLightcoreGuide(supabaseUser, userId) {
  try {
    const { data, error } = await supabaseUser
      .from('lightcore_brain_context')
      .select('current_state, positives, concerns, suggestions, recent_logs')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (data && (data.current_state || data.positives || data.concerns || data.suggestions)) {
      return {
        current_state: data.current_state || null,
        positives: Array.isArray(data.positives) ? data.positives : undefined,
        concerns: Array.isArray(data.concerns) ? data.concerns : undefined,
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : undefined,
      };
    }

    // Fallback if nothing is stored yet
    return { current_state: 'Log your first entry to begin AI calibration.' };
  } catch (e) {
    console.error('Error fetching guide context:', e.message);
    return { error: 'Unable to load guidance.' };
  }
}

// 6) ChronoDeck: last 7 days of events
async function fetchChronoDeck(supabaseUser, userId, userTimezone) {
  try {
    const end = getLocalNow(userTimezone);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const endOfEnd = new Date(end);
    endOfEnd.setHours(23, 59, 59, 999);

    const { data, error } = await supabaseUser
      .from('events')
      .select('event_type, event_time')
      .eq('user_id', userId)
      .gte('event_time', start.toISOString())
      .lte('event_time', endOfEnd.toISOString())
      .order('event_time', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Error fetching ChronoDeck events:', e.message);
    return [];
  }
}

/* ---------------- Handler ---------------- */

exports.handler = async (event) => {
  try {
    const token =
      (event.headers && event.headers.authorization && event.headers.authorization.split(' ')[1]) ||
      (event.headers && event.headers.Authorization && event.headers.Authorization.split(' ')[1]) ||
      (event.headers && event.headers.AUTHORIZATION && event.headers.AUTHORIZATION.split(' ')[1]);

    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };
    }

    const supabaseUser = createUserClient(token);
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };
    }

    const userTimezone = event.queryStringParameters?.tz || 'UTC';

    const [logCount, weeklySummaryData, nudgeData, recentEntriesData, lightcoreGuideData, chronoDeckData] =
      await Promise.all([
        fetchDistinctDayCount(supabaseUser, user.id, userTimezone),        // <-- UNIQUE DAYS
        fetchWeeklySummary(supabaseUser, user.id, userTimezone),
        fetchNudge(supabaseUser, user.id),
        fetchRecentEntries(supabaseUser, user.id),
        fetchLightcoreGuide(supabaseUser, user.id),
        fetchChronoDeck(supabaseUser, user.id, userTimezone),
      ]);

    return {
      statusCode: 200,
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        logCount,                // used by AICoreCalibration (1/7/14/30 unlocks)
        weeklySummaryData,
        nudgeData,
        recentEntriesData,
        lightcoreGuideData,
        chronoDeckData,
      }),
    };
  } catch (e) {
    console.error('Error in get-dashboard-data:', e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to load dashboard data.' }) };
  }
};
