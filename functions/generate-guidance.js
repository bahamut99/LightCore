// LightCore v2025-08-17 build-07 — generate-guidance (no-data-loss memory update)
// Purpose: Generate concise, app-aware guidance JSON from recent context.
// Inputs: Authorization: Bearer <supabase access token>; optional JSON body { source?: string }.
// Outputs (200): { guidance: { current_state, positives[], concerns[], suggestions[] } }
// Errors: 4xx for auth, 5xx for upstream/model issues. No PII is logged.

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const TAG = '[generate-guidance]';

const userClient = (token) =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

const adminClient = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Truncate any free text before sending to AI or logging
function safeLogSnippet(row) {
  const raw = row?.log ?? row?.ai_notes ?? row?.notes ?? row?.text ?? row?.entry ?? '';
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  return s.length > 75 ? `${s.slice(0, 75)}...` : s;
}

function formatContextForAI(ctx) {
  let out = "Here is a summary of the user's recent health data:\n\n";
  if (ctx.user_summary) out += `=== Your Previous Summary of the User ===\n"${ctx.user_summary}"\n\n`;
  if (ctx.ai_persona_memo) out += `=== Your Internal Memos About This User ===\n"${ctx.ai_persona_memo}"\n\n`;

  if (Array.isArray(ctx.recent_logs) && ctx.recent_logs.length > 0) {
    out += "=== User's Most Recent Logs & Scores ===\n";
    ctx.recent_logs.slice(0, 7).forEach((log) => {
      const date = new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const scores = `Clarity: ${log.clarity_score ?? 'N/A'}, Immune: ${log.immune_score ?? 'N/A'}, Physical: ${log.physical_readiness_score ?? 'N/A'}`;
      out += `[${date}] Scores: ${scores} | Log: "${safeLogSnippet(log)}"\n`;
    });
    out += '\n';
  }

  if (Array.isArray(ctx.chrono_events) && ctx.chrono_events.length > 0) {
    out += "=== User's Recent Timed Events (ChronoDeck) ===\n";
    ctx.chrono_events.slice(0, 15).forEach((evt) => {
      const d = new Date(evt.event_time);
      const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      out += `- ${evt.event_type} at ${time} on ${date}\n`;
    });
    out += '\n';
  }

  if (Array.isArray(ctx.recent_insights) && ctx.recent_insights.length > 0) {
    out += "=== Past Insights You've Already Given ===\n";
    out += 'Avoid repeating these points.\n';
    ctx.recent_insights.forEach((i) => (out += `- "${i}"\n`));
    out += '\n';
  }
  return out;
}

function buildPrompt(formatted) {
  return (
    `You are LightCore — a unified, personalized health AI guide. Produce ONE valid JSON object only.\n\n` +
    `Top-level keys:\n` +
    `- "guidance_for_user": { "current_state", "positives", "concerns", "suggestions" }\n` +
    `- "memory_update": { "new_user_summary", "new_ai_persona_memo" }\n\n` +
    `Limits (IMPORTANT): Return at most 5 positives, 5 concerns, 8 suggestions. Pick the most actionable and non-duplicative.\n` +
    `Constraints: Be app-aware (reference LightCore features), use 1–3 day experiments, no medical advice, no external apps/services.\n` +
    `Style: concise, supportive, privacy-respecting.\n\n` +
    `Output JSON only. No extra text.\n\n` +
    `DATA CONTEXT:\n${formatted}`
  );
}

function extractJson(str) {
  if (!str) return null;
  const fenced = str.match(/```json([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : str;
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  try {
    return JSON.parse(raw.slice(first, last + 1));
  } catch {
    return null;
  }
}

function fallbackGuidance() {
  return {
    current_state:
      'I could not compute full guidance right now. Your recent activity is noted—keep logs flowing and try one simple lever for 1–3 days.',
    positives: [],
    concerns: [],
    suggestions: [
      "Tap '+ LOG' to add a quick entry today",
      "Add one event (e.g., 'Meal' or 'Caffeine') to seed patterns",
      'Pick a single focus metric for the week (e.g., Clarity)',
    ],
  };
}

exports.handler = async (event) => {
  console.info(`${TAG} start`);
  try {
    // Auth
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization || event.headers?.AUTHORIZATION;
    const token = authHeader?.split(' ')[1];
    if (!token) {
      console.warn(`${TAG} 401 no bearer token`);
      return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };
    }

    const supabase = userClient(token);
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) {
      console.warn(`${TAG} 401 no user`);
      return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };
    }
    console.info(`${TAG} uid=${user.id}`);

    // Context (prefer long-term context table; otherwise minimal)
    let { data: ctx, error: ctxErr } = await supabase
      .from('lightcore_brain_context')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (ctxErr || !ctx) {
      console.info(`${TAG} no brain context → building minimal context`);
      const { data: recentLogs } = await supabase
        .from('daily_logs')
        .select(
          'id, created_at, clarity_score, immune_score, physical_readiness_score, ai_notes, log, notes, text, entry'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(7);

      const { data: chrono } = await supabase
        .from('events')
        .select('event_type, event_time')
        .eq('user_id', user.id)
        .order('event_time', { ascending: false })
        .limit(15);

      const hasAnySignal = (recentLogs?.length || 0) >= 1 || (chrono?.length || 0) >= 1;
      if (!hasAnySignal) {
        console.info(`${TAG} no logs/events → starter guidance`);
        return {
          statusCode: 200,
          body: JSON.stringify({
            guidance: {
              current_state:
                'Log data for a few days to start generating personalized guidance.',
              positives: [],
              concerns: [],
              suggestions: [
                "Tap '+ LOG' to add a quick entry today",
                "Try a 'Meal' or 'Caffeine' event to seed the timeline",
              ],
            },
          }),
        };
      }

      ctx = {
        recent_logs: recentLogs ?? [],
        chrono_events: chrono ?? [],
        user_summary: null,
        ai_persona_memo: null,
        recent_insights: [],
      };
    }

    const formatted = formatContextForAI(ctx);
    const prompt = buildPrompt(formatted);

    // Upstream call with timeout (12s). No PII in error logs.
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);

    const aiResp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    }).catch((e) => {
      console.error(`${TAG} Gemini fetch failed: ${e?.name || 'error'}`);
      return null;
    });
    clearTimeout(t);

    if (!aiResp || !aiResp.ok) {
      const status = aiResp ? aiResp.status : 599;
      console.error(`${TAG} Gemini error status=${status}`);
      return { statusCode: 200, body: JSON.stringify({ guidance: fallbackGuidance() }) };
    }

    const aiJson = await aiResp.json();
    const text = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    const parsed = extractJson(text);

    const fromModel = parsed?.guidance_for_user || parsed?.guidance || parsed?.guide || null;
    const guidance = fromModel
      ? {
          current_state:
            fromModel.current_state ||
            fromModel.currentState ||
            fromModel.summary ||
            fromModel.message ||
            'Here’s your current state.',
          positives: Array.isArray(fromModel.positives || fromModel.strengths)
            ? (fromModel.positives || fromModel.strengths).slice(0, 5)
            : [],
          concerns: Array.isArray(fromModel.concerns || fromModel.risks || fromModel.issues)
            ? (fromModel.concerns || fromModel.risks || fromModel.issues).slice(0, 5)
            : [],
          suggestions: Array.isArray(
            fromModel.suggestions || fromModel.actions || fromModel.recommendations
          )
            ? (fromModel.suggestions ||
                fromModel.actions ||
                fromModel.recommendations
              ).slice(0, 8)
            : [],
        }
      : fallbackGuidance();

    // Memory upsert (server role; table secured by RLS)
    const memoryUpdate = parsed?.memory_update || null;
    if (memoryUpdate) {
      // Only write non-empty strings; never send nulls to avoid clobbering.
      const hasNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

      const upsertData = { user_id: user.id, updated_at: new Date().toISOString() };

      if (hasNonEmpty(memoryUpdate.new_user_summary) &&
          memoryUpdate.new_user_summary !== ctx?.user_summary) {
        upsertData.user_summary = memoryUpdate.new_user_summary;
      }

      if (hasNonEmpty(memoryUpdate.new_ai_persona_memo) &&
          memoryUpdate.new_ai_persona_memo !== ctx?.ai_persona_memo) {
        upsertData.ai_persona_memo = memoryUpdate.new_ai_persona_memo;
      }

      // Only hit DB if at least one field is actually changing.
      if ('user_summary' in upsertData || 'ai_persona_memo' in upsertData) {
        try {
          const admin = adminClient();
          await admin
            .from('lightcore_brain_context')
            .upsert(upsertData, { onConflict: 'user_id' });
        } catch (e) {
          // Do not fail the request for memory issues; just log without PII
          console.warn(`${TAG} memory upsert warn`);
        }
      }
    }

    console.info(
      `${TAG} ok pos=${guidance.positives.length} con=${guidance.concerns.length} sug=${guidance.suggestions.length}`
    );
    return { statusCode: 200, body: JSON.stringify({ guidance }) };
  } catch (err) {
    console.error(`${TAG} error`, err?.message || err);
    return {
      statusCode: 200, // return graceful guidance instead of 500 for better UX
      body: JSON.stringify({ guidance: fallbackGuidance() }),
    };
  }
};

/* How to test (local via Netlify CLI):
1) Ensure env vars are set (SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY, GEMINI_API_KEY, optional GEMINI_MODEL).
2) Start dev: `netlify dev`.
3) With a signed-in session in the app, open Neural-Cortex and click the Locus; guidance should appear.
4) cURL (replace <TOKEN>):
   curl -X POST -H "Authorization: Bearer <TOKEN>" http://localhost:8888/.netlify/functions/generate-guidance
Expected: 200 with { guidance: { current_state, positives[], concerns[], suggestions[] } }
*/

