import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export async function handler(event, context) {
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
              'You are an AI health assistant. Given a user’s log, score their Mental Clarity, Immune Risk, and Physical Output as High, Medium, or Low. Also give a brief note.',
          },
          { role: 'user', content: log },
        ],
      }),
    });

    const json = await response.json();
    const message = json.choices?.[0]?.message?.content || '';
    const parts = message.split('\n').map((p) => p.split(':')[1]?.trim() || '');

    // Store to Supabase
    await supabase.from('daily_logs').insert([
      {
        Log: log,
        Clarity: parts[0],
        Immune: parts[1],
        'Physical Readiness': parts[2],
        Notes: parts[3],
      },
    ]);

    // Fetch recent logs
    const { data: recentLogsData, error } = await supabase
      .from('daily_logs')
      .select('created_at, Log, Clarity, Immune, "Physical Readiness", Notes')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw new Error(error.message);

    const recentLogs = recentLogsData.map(row => [
      new Date(row.created_at).toLocaleDateString(),
      row.Log,
      row.Clarity,
      row.Immune,
      row['Physical Readiness'],
      row.Notes,
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({ result: parts, recentLogs }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
}