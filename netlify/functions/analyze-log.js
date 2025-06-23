exports.handler = async function (event) {
  console.log("Function hit:", event.httpMethod);

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
import { createClient } from '@supabase/supabase-js';

// Helper function to convert numeric scores to text labels
function convertScore(num) {
  const n = parseInt(num, 10);
  if (isNaN(n)) return 'unknown';
  if (n >= 8) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
}

export async function handler(event) {
  // 1. === Validate Request ===
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request body' }),
    };
  }

  const { log: entry } = body;
  if (!entry) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Log entry is required' }),
    };
  }
  
  // Initialize Supabase client with secret keys from environment variables
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    // 2. === Call OpenAI for Analysis ===
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
            content: `You are a health analysis bot. Analyze the user's log and return a JSON object with four keys: "clarity", "immune", "physical" (each with a numerical score from 1-10), and "note" (a brief 1-2 sentence summary).`,
          },
          {
            role: 'user',
            content: `Here is my log: "${entry}"`,
          },
        ],
      }),
    });

    if (!openaiResponse.ok) {
        throw new Error(`OpenAI API responded with status: ${openaiResponse.status}`);
    }

    const aiData = await openaiResponse.json();
    
    // 3. === Safely Parse the AI Response ===
    if (!aiData.choices || aiData.choices.length === 0 || !aiData.choices[0].message?.content) {
      throw new Error("Invalid or empty response structure from OpenAI");
    }

    let aiResult;
    try {
      aiResult = JSON.parse(aiData.choices[0].message.content);
    } catch (parseError) {
      console.error("Failed to parse JSON from OpenAI response:", parseError);
      throw new Error("OpenAI returned malformed JSON content.");
    }
    
    // 4. === Prepare Data for Database ===
    const newLogEntry = {
        Log: entry,
        Clarity: convertScore(aiResult.clarity),
        Immune: convertScore(aiResult.immune),
        PhysicalReadiness: convertScore(aiResult.physical),
        Notes: aiResult.note.trim(),
    };

    // 5. === Insert Data into Supabase ===
    const { data: insertedData, error: dbError } = await supabase
        .from('daily_logs')
        .insert(newLogEntry)
        .select() // Use .select() to get the inserted row back
        .single(); // We expect only one row back

    if (dbError) {
      console.error("Supabase insert error:", dbError);
      throw new Error("Failed to save log to the database.");
    }

    // 6. === Return Success Response to Frontend ===
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