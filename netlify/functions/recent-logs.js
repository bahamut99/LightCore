import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  // === Standardized Security Check ===
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
  }
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
  }

  try {
    // Now this client will correctly respect the RLS policies
    const { data, error } = await supabase
      .from('daily_logs')
      .select('created_at, Log, Clarity, Immune, PhysicalReadiness, Notes, sleep_hours, sleep_quality')
      .order('created_at', { ascending: false })
      .limit(7);

    if (error) { throw new Error(`Supabase query error: ${error.message}`); }

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
}