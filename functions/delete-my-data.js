// delete-my-data.js — Hard delete user content and Supabase auth user.
// Safety: requires a valid session. No extra confirm to match your current UI button.
// If you want a confirm gate later, we can add a ?confirm=true check.

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

    // Delete rows in a safe order (children -> parent)
    const tid = new Date().toISOString();
    const run = async (q) => {
      const { error } = await q;
      if (error) throw error;
    };

    await run(admin.from('events').delete().eq('user_id', user.id));
    await run(admin.from('nudges').delete().eq('user_id', user.id));
    await run(admin.from('daily_logs').delete().eq('user_id', user.id));
    await run(admin.from('lightcore_brain_context').delete().eq('user_id', user.id));

    // Finally remove the auth user
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: true, deleted_at: tid }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Delete request failed.' }) };
  }
};
