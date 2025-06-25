// This version is for advanced debugging.
export async function handler(event, context) {
  console.log("--- Advanced Environment Variable Check ---");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  console.log("SUPABASE_URL Type:", typeof url, "| Length:", url?.length);
  console.log("SUPABASE_KEY (secret) Type:", typeof key, "| Length:", key?.length);
  console.log("SUPABASE_ANON_KEY (public) Type:", typeof anonKey, "| Length:", anonKey?.length);
  console.log("OPENAI_API_KEY Type:", typeof openaiKey, "| Length:", openaiKey?.length);
  console.log("---------------------------------------");

  // The function will likely still fail, but this log is what we need.
  const { createClient } = require('@supabase/supabase-js');
  const supabaseAdmin = createClient(url, key);

  return {
      statusCode: 500,
      body: JSON.stringify({ error: "This is a deliberate crash after advanced logging." }),
  };
}