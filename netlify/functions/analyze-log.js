const fetch = require('node-fetch');

exports.handler = async function (event) {
  console.log("Function hit:", event.httpMethod);

  if (event.httpMethod !== 'POST') {
    return {
const fetch = require('node-fetch');

exports.handler = async function (event) {
  console.log("Function hit:", event.httpMethod);

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    console.error("JSON parse error:", err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON format' }),
    };
  }

  const entry = body.log;
  console.log("Parsed entry:", entry);

  if (!entry) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing log entry' }),
    };
  }

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: `Analyze the following daily health log. Return 3 labeled scores and a brief note in this format:\nClarity: [value]\nImmune: [value]\nPhysical: [value]\nNote: [summary]\n\nLog: "${entry}"`
          }
        ]
      })
    });

    const data = await openaiResponse.json();
    console.log("Full OpenAI response:", JSON.stringify(data, null, 2));

    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error("Missing expected message content from OpenAI");
    }

    const message = data.choices[0].message.content.trim();

    return {
      statusCode: 200,
      body: JSON.stringify({ message })  // ✅ Correct format for frontend
    };

  } catch (err) {
    console.error("GPT request error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to analyze log' })
    };
  }
};