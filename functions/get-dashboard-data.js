// netlify/functions/get-dashboard-data.js
// Dashboard data aggregator (stable, pre “progress-line” work)
// - Uses your existing table/column names
// - logCount = TOTAL LOG ROWS (not distinct days) — original behavior
// - Lightcore Guide pulls from guidance cache if present; otherwise falls back to brain context

const { createClient } = require('@supabase/supabase-js');

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function getBearer(event) {
  const h =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    event.headers?.AUTHORIZATION;
  if (!h) return null;
  return h.startsWith('Bearer ') ? h.split(' ')[1] : h;
}

exports.handler = async (event) => {
  try {
    const token = getBearer(event);
    if (!token) return json(401, { error: 'Not authorized.' });

    const tz = event.queryStringParameters?.tz || 'UTC'; // forwarded to charts if needed

    // RLS-bound user client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Identify user
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return json(401, { error: 'User not found' });
    const userId = user.id;

    // ----- fetch pieces in parallel (each guarded) -----
    const [
      logCount,
      weeklySummaryData,
      recentEntriesData,
      lightcoreGuideData,
      chronoDeckData,
      nudgeData,
    ] = await Promise.all([
      (async () => {
        // ORIGINAL behavior: count raw rows (not distinct days)
        const { count, error } = await supabase
          .from('daily_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        if (error) throw error;
        return count || 0;
      })().catch((e) => {
        console.error('logCount error:', e.message);
        return 0;
      }),

      (async () => {
        // Weekly summary (unique local days this week for the dots)
        // Safe default goal = 6 if none set
        let goalValue = 6;
        try {
          const { data: goal } = await supabase
            .from('goals')
            .select('goal_value, is_active')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          if (goal?.goal_value) goalValue = Number(goal.goal_value) || 6;
        } catch {}

        // Count unique days in last 7 local days
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);

        const { data: weekLogs } = await supabase
          .from('daily_logs')
          .select('created_at')
          .eq('user_id', userId)
          .gte('created_at', start.toISOString());

        const dayKey = (iso) =>
          new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(iso));

        const days = new Set();
        (weekLogs || []).forEach((r) => days.add(dayKey(r.created_at)));

        return { progress: days.size, goal: { goal_value: goalValue } };
      })().catch((e) => {
        console.error('weeklySummary error:', e.message);
        return { progress: 0, goal: { goal_value: 6 } };
      }),

      (async () => {
        // Recent entries (columns that exist in your schema)
        const { data, error } = await supabase
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
        if (error) throw error;
        return data || [];
      })().catch((e) => {
        console.error('recentEntries error:', e.message);
        return [];
      }),

      (async () => {
        // Lightcore Guide: prefer cached guidance; fallback to brain_context.user_summary
        // Cache shape: { guidance: { current_state, positives, concerns, suggestions, ... } }
        try {
          const { data: cache } = await supabase
            .from('lightcore_guidance_cache')
            .select('guidance')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const g = cache?.guidance;
          if (g) {
            // handle either top-level or nested structures safely
            const src = g.guidance_for_user || g;
            return {
              current_state: src.current_state || '',
              positives: Array.isArray(src.positives) ? src.positives : [],
              concerns: Array.isArray(src.concerns) ? src.concerns : [],
              suggestions: Array.isArray(src.suggestions) ? src.suggestions : [],
            };
          }
        } catch {}

        // Fallback: show the stored summary if present
        try {
          const { data: bc } = await supabase
            .from('lightcore_brain_context')
            .select('user_summary')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

          if (bc?.user_summary) {
            return {
              current_state: bc.user_summary,
              positives: [],
              concerns: [],
              suggestions: [],
            };
          }
        } catch {}

        return {
          current_state: 'Unable to load guidance.',
          positives: [],
          concerns: [],
          suggestions: [],
        };
      })().catch((e) => {
        console.error('guide error:', e.message);
        return {
          current_state: 'Unable to load guidance.',
          positives: [],
          concerns: [],
          suggestions: [],
        };
      }),

      (async () => {
        // ChronoDeck events (last ~7 days)
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);

        const { data, error } = await supabase
          .from('events')
          .select('id, event_time, event_type, event_color')
          .eq('user_id', userId)
          .gte('event_time', start.toISOString())
          .order('event_time', { ascending: true })
          .limit(250);

        if (error) throw error;
        return data || [];
      })().catch((e) => {
        console.error('chronoDeck error:', e.message);
        return [];
      }),

      (async () => {
        // Latest unacknowledged nudge
        const { data, error } = await supabase
          .from('nudges')
          .select('id, headline, body_text, suggested_actions, is_acknowledged, created_at')
          .eq('user_id', userId)
          .eq('is_acknowledged', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        return data || null;
      })().catch((e) => {
        console.error('nudge error:', e.message);
        return null;
      }),
    ]);

    return json(200, {
      logCount,                 // ORIGINAL: total rows
      weeklySummaryData,
      recentEntriesData,
      lightcoreGuideData,
      chronoDeckData,
      nudgeData,
      tz,
    });
  } catch (err) {
    console.error('get-dashboard-data fatal:', err);
    return json(500, { error: 'Failed to load dashboard data.' });
  }
};

