// LightCore v2025-08-16 build-03 — generate-guidance
// Netlify function: /.netlify/functions/generate-guidance

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
    `You are LightCore – a unified, personalized health AI guide. Review the user's context and produce ONE valid JSON object.\n\n` +
    `Top-level keys:\n` +
    `- "guidance_for_user": { "current_state", "positives", "concerns", "suggestions" }\n` +
    `- "memory_update": { "new_user_summary", "new_ai_persona_memo" }\n\n` +
    `Guidelines: Be app-aware (use LightCore features), be specific (1–3 day experiments), no external apps, no medical advice.\n\n` +
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
  try { return JSON.parse(raw.slice(first, last + 1)); } catch { return null; }
}

exports.handler = async (event) => {
  console.info(`${TAG} start`);
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || event.headers?.AUTHORIZATION;
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

    // Try full brain context first
    let { data: ctx, error: ctxErr } = await supabase
      .from('lightcore_brain_context')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // If missing, build a minimal live context (NO 2-log gate)
    if (ctxErr || !ctx) {
      console.info(`${TAG} no brain context → building minimal context`);
      const { data: recentLogs } = await supabase
        .from('daily_logs')
        .select('id, created_at, clarity_score, immune_score, physical_readiness_score, ai_notes, log, notes, text, entry')
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
              current_state: 'Log data for a few days to start generating personalized guidance.',
              positives: [],
              concerns: [],
              suggestions: ["Tap '+ LOG' to add a quick entry today", "Try a 'Meal' or 'Caffeine' event to seed the timeline"],
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

    const aiResp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    if (!aiResp.ok) {
      const body = await aiResp.text();
      console.error(`${TAG} Gemini error ${aiResp.status}: ${body}`);
      throw new Error(`Gemini API error: ${aiResp.status}`);
    }

    const aiJson = await aiResp.json();
    const text = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    const parsed = extractJson(text);
    if (!parsed) throw new Error('AI did not return valid JSON');

    const guidanceRaw = parsed.guidance_for_user || parsed.guidance || parsed.guide || {};
    const memoryUpdate = parsed.memory_update || null;

    const guidance = {
      current_state: guidanceRaw.current_state || guidanceRaw.currentState || guidanceRaw.summary || guidanceRaw.message || 'Here’s your current state.',
      positives: guidanceRaw.positives || guidanceRaw.strengths || [],
      concerns: guidanceRaw.concerns || guidanceRaw.risks || guidanceRaw.issues || [],
      suggestions: guidanceRaw.suggestions || guidanceRaw.actions || guidanceRaw.recommendations || [],
    };

    if (memoryUpdate) {
      console.info(`${TAG} upserting memory`);
      const admin = adminClient();
      await admin
        .from('lightcore_brain_context')
        .upsert(
          {
            user_id: user.id,
            user_summary: memoryUpdate.new_user_summary ?? null,
            ai_persona_memo: memoryUpdate.new_ai_persona_memo ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
    }

    console.info(`${TAG} ok pos=${guidance.positives.length} con=${guidance.concerns.length} sug=${guidance.suggestions.length}`);
    return { statusCode: 200, body: JSON.stringify({ guidance }) };
  } catch (err) {
    console.error(`${TAG} error:`, err?.message || err);
    return { statusCode: 500, body: JSON.stringify({ error: "Sorry, I couldn't generate guidance right now." }) };
  }
};
