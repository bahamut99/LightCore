import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  // Initialize Supabase client with secret keys from environment variables
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    // 1. === Query the Database ===
    // We only select the columns needed for the table display
    const { data, error } = await supabase
      .from('daily_logs')
      .select('created_at, Log, Clarity, Immune, PhysicalReadiness, Notes')
      .order('created_at', { ascending: false })
      .limit(7);

    if (error) {
      // If Supabase returns an error, we throw it to be caught by the catch block
      throw error;
    }

    // 2. === Format the Data for the Frontend ===
    // The frontend's renderLogTable function expects an array of arrays.
    // We will format the data here to ensure the frontend doesn't need to change.
    const formattedRows = data.map(row => [
      row.created_at,
      row.Log,
      row.Clarity,
      row.Immune,
      row.PhysicalReadiness,
      row.Notes,
    ]);

    // 3. === Return Success Response to Frontend ===
    return {
      statusCode: 200,
      body: JSON.stringify(formattedRows),
    };

  } catch (error) {
    console.error("Error in recent-log function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}