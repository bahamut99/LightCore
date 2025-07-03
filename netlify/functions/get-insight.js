import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  // 1. Security Check: Verify the user is logged in.
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
  }
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
  }

  try {
    // 2. Fetch User's Last 30 Days of Data
    // The client is scoped to the user and will respect RLS policies.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: logs, error: dbError } = await supabase
      .from('daily_logs')
      .select('created_at, Log, Clarity, Immune, PhysicalReadiness, sleep_hours, sleep_quality')
      .eq('user_id', user.id)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (dbError) throw new Error(`Supabase query error: ${dbError.message}`);

    if (!logs || logs.length < 3) {
      // Not enough data to find a meaningful insight yet.
      return { statusCode: 200, body: JSON.stringify({ insight: "Keep logging your entries for a few more days, and I'll be able to show you some interesting patterns!" }) };
    }

    // 3. Format the Data for the AI
    const formattedHistory = logs.map(log => {
      let entry = `Date: ${new Date(log.created_at).toLocaleDateString()}; Sleep: ${log.sleep_hours || 'N/A'}h (Quality: ${log.sleep_quality || 'N/A'}/5); Clarity: ${log.Clarity}; Immune Risk: ${log.Immune}; Physical Output: ${log.PhysicalReadiness}; Note: "${log.Log}"`;
      return entry;
    }).join('\n');

    // 4. Call OpenAI with our Persona-Driven Prompt
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: "You are LightCore, a friendly, empathetic, and insightful AI health coach. Your tone is supportive and encouraging, like a knowledgeable friend. You are not a doctor and you must never give direct medical advice. Your goal is to find one interesting correlation or pattern in the user's recent health data."
          },
          {
            role: 'user',
            content: `Here is my health data for the last ${logs.length} days:\n\n${formattedHistory}\n\nBased on this data, what is the single most interesting and actionable pattern you can find? Frame it as a gentle observation to help me on my wellness journey. Be concise and keep it to 1-3 sentences.`
          },
        ],
        temperature: 0.6,
      }),
    });

    if (!openaiResponse.ok) {
        const errorBody = await openaiResponse.json();
        throw new Error(`OpenAI API Error: ${errorBody.error.message}`);
    }

    const aiData = await openaiResponse.json();
    const insight = aiData.choices[0].message.content;

    // 5. Return the Insight
    return {
      statusCode: 200,
      body: JSON.stringify({ insight: insight }),
    };

  } catch (error) {
    console.error("Error in get-insight function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}