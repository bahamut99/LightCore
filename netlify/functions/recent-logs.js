import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  // Security Check
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header required.' }) };
  }
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
  }

  try {
    // This client is now scoped to the logged-in user and will respect RLS policies
    const { data, error } = await supabase
      .from('daily_logs')
      .select('created_at, Log, Clarity, Immune, PhysicalReadiness, Notes, sleep_hours, sleep_quality')
      .eq('user_id', user.id) // Explicitly query for this user's logs
      .order('created_at', { ascending: false })
      .limit(7);

    if (error) throw error;
    
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}