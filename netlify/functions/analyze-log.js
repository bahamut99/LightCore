import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export async function handler(event) {
  try {
    const { log } = JSON.parse(event.body);

    if (!log) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing log input' }),
      };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'You are an AI health assistant. Given a user’s log, score their Mental Clarity, Immune Risk, and Physical Readiness as High, Medium, or Low. Also give a brief note.',
          },
          { role: 'user', content: log },
        ],
      }),
    });

    const json = await response.json();
    const message = json.choices?.[0]?.message?.content || '';

    const parts = message.split('\n').map((p) => p.split(':')[1]?.trim() || '');

    const insert = await supabase.from('daily_logs').insert([
      {
        Log: log,
        Clarity: parts[0],
        Immune: parts[1],
        PhysicalReadiness: parts[2],
        Notes: parts[3],
        Date: new Date().toISOString(),
      },
    ]);

    if (insert.error) {
      throw insert.error;
    }

    // Also fetch the latest logs to return to frontend
    const { data: recentLogs, error: fetchError } = await supabase
      .from('daily_logs')
      .select('Date, Log, Clarity, Immune, PhysicalReadiness, Notes')
      .order('Date', { ascending: false })
      .limit(7);

    if (fetchError) throw fetchError;

    return {
      statusCode: 200,
      body: JSON.stringify({
        result: parts,
        recentLogs: recentLogs.map(row => [
          new Date(row.Date).toLocaleDateString(),
          row.Log,
          row.Clarity,
          row.Immune,
          row.PhysicalReadiness,
          row.Notes
        ])
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message || 'Unknown error' }),
    };
  }
}