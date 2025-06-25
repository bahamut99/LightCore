import { createClient } from '@supabase/supabase-js';

// === THIS HELPER FUNCTION WAS MISSING. IT IS NOW CORRECTLY RE-ADDED. ===
function convertScore(num) {
  const n = parseInt(num, 10);
  if (isNaN(n)) return 'unknown';
  if (n >= 8) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
}
// ======================================================================

export async function handler(event) {
  // 1. SECURITY CHECK
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
  }
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
  }
  
  // 2. VALIDATE REQUEST BODY
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (parseError) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }
  const { log: entry } = body;
  if (!entry) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Log entry is required' }) };
  }

  // Use the admin client for database operations
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    // 3. Call OpenAI for Analysis
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'system',
            content: `You are a health analysis bot. Analyze the user's log and return a valid JSON object with four keys: "clarity", "immune", "physical" (each with a numerical score from 1-10), and "note" (a brief 1-2 sentence summary).`
          },
          {
            role: 'user',
            content: `Here is my log: "${entry}"`,
          },
        ],
      }),
    });

    if (!openaiResponse.ok) {
        const errorBody = await openaiResponse.json();
        console.error("OpenAI API Error:", errorBody);
        throw new Error(`OpenAI API responded with status: ${openaiResponse.status}`);
    }

    const aiData = await openaiResponse.json();
    
    // 4. Safely Parse the AI Response
    if (!aiData.choices || !aiData.choices[0].message?.content) {
      throw new Error("Invalid response structure from OpenAI");
    }

    let aiResult;
    try {
      aiResult = JSON.parse(aiData.choices[0].message.content);
    } catch (parseError) {
      throw new Error("OpenAI returned malformed JSON content.");
    }
    
    // 5. Prepare Data for Database
    const newLogEntry = {
        user_id: user.id,
        Log: entry,
        Clarity: convertScore(aiResult.clarity),
        Immune: convertScore(aiResult.immune),
        PhysicalReadiness: convertScore(aiResult.physical),
        Notes: aiResult.note.trim(),
    };

    // 6. Insert Data into Supabase
    const { data: insertedData, error: dbError } = await supabaseAdmin
        .from('daily_logs')
        .insert(newLogEntry)
        .select()
        .single();

    if (dbError) {
      console.error("Supabase insert error:", dbError);
      throw new Error("Failed to save log to the database.");
    }

    // 7. Return Success Response to Frontend
    return {
      statusCode: 200,
      body: JSON.stringify(insertedData),
    };

  } catch (error) {
    console.error("Error in analyze-log function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}