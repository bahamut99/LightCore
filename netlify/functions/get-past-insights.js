import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  // 1. Security Check: Verify the user is logged in.
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
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
    // 2. Fetch all insights for the logged-in user from the 'insights' table
    // The client is scoped to the logged-in user, but we add an explicit .eq() for clarity and security.
    const { data, error } = await supabase
      .from('insights')
      .select('created_at, insight_text')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }); // Newest insights first

    if (error) {
      throw error;
    }
    
    // 3. Return the list of insights
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (e) {
    console.error("Error fetching insights:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
}