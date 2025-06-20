import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export async function handler(event, context) {
  try {
    const { data, error } = await supabase
      .from('daily_logs')
      .select()
      .order('created_at', { ascending: false })
      .limit(7);

    if (error) throw error;

    const rows = data.map((row) => [
      row.created_at,
      row.Log,
      row.Clarity,
      row.Immune,
      row['Physical Readiness'],
      row.Notes,
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify(rows),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
}