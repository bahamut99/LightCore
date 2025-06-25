import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  // We will add the security check here in the final step.
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    const { data, error } = await supabase
      .from('daily_logs')
      // === THE FIX IS HERE: We now select the new sleep columns ===
      .select('created_at, Log, Clarity, Immune, PhysicalReadiness, Notes, sleep_hours, sleep_quality')
      .order('created_at', { ascending: false })
      .limit(7);

    if (error) throw error;

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