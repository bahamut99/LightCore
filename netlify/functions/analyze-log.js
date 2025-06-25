import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  // === NEW DIAGNOSTIC CODE ===
  // This will print a report to your Netlify Function Log.
  console.log("--- Netlify Environment Variable Check ---");
  console.log("Does SUPABASE_URL exist?", !!process.env.SUPABASE_URL);
  console.log("Does SUPABASE_KEY (the secret one) exist?", !!process.env.SUPABASE_KEY);
  console.log("Does SUPABASE_ANON_KEY (the public one) exist?", !!process.env.SUPABASE_ANON_KEY);
  console.log("Does OPENAI_API_KEY exist?", !!process.env.OPENAI_API_KEY);
  console.log("------------------------------------------");
  // The '!!' turns the value into a simple true or false.

  // The rest of the function will still run and fail, which is expected.
  // We just need the log output from above.

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY // This is the line that is failing
  );

  // The function will crash here, but after printing our report.
  
  return {
      statusCode: 500,
      body: JSON.stringify({ error: "This is a deliberate crash after logging." }),
  };
}