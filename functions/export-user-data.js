// export-user-data.js — Return a JSON download of the user's data.
// No external deps. Uses service role for cross-table reads, but identifies the user via the access token.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const userClient = (token) =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

const adminClient = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
  try {
    const auth =
      event.headers?.authorization || event.headers?.Authorization || event.headers?.AUTHORIZATION;
    const token = auth?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supa = userClient(token);
    const { data: ures, error: uerr } = await supa.auth.getUser();
    const user = ures?.user;
    if (uerr || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    const admin = adminClient();

    // Fetch per-user data from main tables
    const [logs, events, nudges, ctx] = await Promise.all([
      admin.from('daily_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      admin.from('events').select('*').eq('user_id', user.id).order('event_time', { ascending: true }),
      admin.from('nudges').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      admin.from('lightcore_brain_context').select('*').eq('user_id', user.id).maybeSingle(),
    ]);

    const payload = {
      meta: {
        exported_at: new Date().toISOString(),
        user_id: user.id,
        email: user.email ?? null,
        schema_version: 1,
      },
      daily_logs: logs.data ?? [],
      events: events.data ?? [],
      nudges: nudges.data ?? [],
      brain_context: ctx.data ?? null,
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="lightcore-export-${user.id}.json"`,
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify(payload),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Export failed.' }) };
  }
};
