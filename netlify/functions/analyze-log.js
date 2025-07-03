import { createClient } from '@supabase/supabase-js';

function convertScore(num) {
  const n = parseInt(num, 10);
  if (isNaN(n)) return 'unknown';
  if (n >= 8) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
}

export async function handler(event) {
  // 1. Security Check: Verify the user's token
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
  }
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
  }
  
  // 2. Validate Request Body
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  let body;
  try { body = JSON.parse(event.body); } catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) }; }
  
  const { log: entry, sleep_hours, sleep_quality } = body;
  if (!entry) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Log entry is required' }) };
  }

  // Use the powerful Admin client for operations that need to bypass RLS
  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  try {
    // 3. Build the AI Prompt
    let promptContent = `Daily Log: "${entry}"`;
    if (sleep_hours) promptContent += `\nHours Slept: ${sleep_hours}`;
    if (sleep_quality) promptContent += `\nSleep Quality Rating (1-5): ${sleep_quality}`;

    // 4. Call OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        response_format: { type: "json_object" },
        messages: [{
          role: 'system',
          content: `You are a health analysis bot. Return a JSON object with "clarity", "immune", and "physical" scores from 1-10, plus a "note". IMPORTANT: For the "immune" score, you are rating the IMMUNE RISK. A high score (like 9) means HIGH RISK (bad), and a low score (like 1) means LOW RISK (good). For "clarity" and "physical", a high score is good.`
        }, {
          role: 'user',
          content: promptContent,
        }],
      }),
    });
    if (!openaiResponse.ok) {
        const errorBody = await openaiResponse.json();
        throw new Error(`OpenAI API Error: ${errorBody.error.message}`);
    }
    const aiData = await openaiResponse.json();

    // 5. Parse AI Response
    let aiResult;
    try {
      aiResult = JSON.parse(aiData.choices[0].message.content);
    } catch (e) { throw new Error("OpenAI returned malformed JSON."); }
    
    // 6. Prepare data for DB
    const newLogEntry = {
        user_id: user.id,
        Log: entry,
        Clarity: convertScore(aiResult.clarity),
        Immune: convertScore(aiResult.immune),
        PhysicalReadiness: convertScore(aiResult.physical),
        Notes: aiResult.note.trim(),
        sleep_hours: sleep_hours || null,
        sleep_quality: sleep_quality || null,
    };

    // 7. Insert data into Supabase
    const { data: insertedData, error: dbError } = await supabaseAdmin
        .from('daily_logs')
        .insert(newLogEntry)
        .select()
        .single();
    if (dbError) throw new Error(`Supabase insert error: ${dbError.message}`);

    return { statusCode: 200, body: JSON.stringify(insertedData) };
  } catch (error) {
    console.error("Error in analyze-log function:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}