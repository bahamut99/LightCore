import { createClient } from '@supabase/supabase-js';

function convertScore(num) {
  const n = parseInt(num, 10);
  if (isNaN(n)) return 'unknown';
  if (n >= 8) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
}

export async function handler(event) {
  // Security Check (no changes)
  // ...

  // Validate Request Body (no changes)
  // ...

  const { log: entry, sleep_hours, sleep_quality } = body;

  // ...

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    let promptContent = `Daily Log: "${entry}"`;
    if (sleep_hours) promptContent += `\nHours Slept: ${sleep_hours}`;
    if (sleep_quality) promptContent += `\nSleep Quality Rating (1-5): ${sleep_quality}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { /* ... */ },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'system',
            // === THIS IS THE CRUCIAL FIX ===
            content: `You are a health analysis bot. Return a JSON object with "clarity", "immune", and "physical" scores from 1-10, plus a "note". IMPORTANT: For the "immune" score, you are rating the IMMUNE RISK. A high score (like 9) means HIGH RISK (bad), and a low score (like 1) means LOW RISK (good). For "clarity" and "physical", a high score is good.`
          },
          {
            role: 'user',
            content: promptContent,
          },
        ],
      }),
    });

    // ... (rest of the function is the same)

  } catch (error) {
    // ... (rest of the function is the same)
  }
}