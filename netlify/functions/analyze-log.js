import { createClient } from '@supabase/supabase-js';

// This helper function is unchanged
function convertScore(num) {
  const n = parseInt(num, 10);
  if (isNaN(n)) return 'unknown';
  if (n >= 8) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
}

export async function handler(event) {
  // Security Check is unchanged
  const authHeader = event.headers.authorization;
  if (!authHeader) { /* ... error handling ... */ }
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) { /* ... error handling ... */ }
  
  // Validate Request Body
  if (event.httpMethod !== 'POST') { /* ... error handling ... */ }
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (parseError) { /* ... error handling ... */ }

  // === NEW: Destructure new sleep data from the request body ===
  const { log: entry, sleep_hours, sleep_quality } = body;

  if (!entry) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Log entry is required' }) };
  }

  // Use the admin client for database operations
  const supabaseAdmin = createClient(
    process.env.SUPABASE_KEY
  );

  try {
    // === NEW: Build a more detailed prompt for the AI ===
    let promptContent = `Daily Log: "${entry}"`;
    if (sleep_hours) {
      promptContent += `\nHours Slept: ${sleep_hours}`;
    }
    if (sleep_quality) {
      promptContent += `\nSleep Quality Rating (1-5): ${sleep_quality}`;
    }

    // Call OpenAI for Analysis
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
            // === NEW: Updated system prompt to mention sleep data ===
            content: `You are a health analysis bot. Analyze the user's log and sleep data to return a valid JSON object with four keys: "clarity", "immune", "physical" (each with a numerical score from 1-10), and "note" (a brief 1-2 sentence summary). Your analysis should be more insightful if sleep data is provided.`
          },
          {
            role: 'user',
            // Use our new, more detailed prompt content
            content: promptContent,
          },
        ],
      }),
    });

    if (!openaiResponse.ok) { /* ... error handling ... */ }

    const aiData = await openaiResponse.json();
    
    // Safely Parse the AI Response
    if (!aiData.choices || !aiData.choices[0].message?.content) { /* ... error handling ... */ }
    let aiResult;
    try {
      aiResult = JSON.parse(aiData.choices[0].message.content);
    } catch (parseError) { /* ... error handling ... */ }
    
    // === NEW: Add sleep data to the object we save in the database ===
    const newLogEntry = {
        user_id: user.id,
        Log: entry,
        Clarity: convertScore(aiResult.clarity),
        Immune: convertScore(aiResult.immune),
        PhysicalReadiness: convertScore(aiResult.physical),
        Notes: aiResult.note.trim(),
        sleep_hours: sleep_hours || null, // Default to null if not provided
        sleep_quality: sleep_quality || null, // Default to null if not provided
    };

    // Insert Data into Supabase
    const { data: insertedData, error: dbError } = await supabaseAdmin
        .from('daily_logs')
        .insert(newLogEntry)
        .select()
        .single();

    if (dbError) { /* ... error handling ... */ }

    // Return Success Response to Frontend
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