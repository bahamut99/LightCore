import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  // Initialize Supabase client with secret keys from environment variables
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    // 1. === Query the Database ===
    const { data, error } = await supabase
      .from('daily_logs')
      .select('created_at, Log, Clarity, Immune, PhysicalReadiness, Notes')
      .order('created_at', { ascending: false })
      .limit(7);

    if (error) {
      throw error;
    }

    // 2. === Return the raw data directly ===
    // The frontend now expects the full array of objects, so we no longer
    // need to format it into an array of arrays. This is the fix.
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error("Error in recent-log function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}