const fetch = require('node-fetch');

exports.handler = async function(event) {
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
    console.error("Error parsing body:", err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { entry } = body;
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
            content: `Analyze this health log and return 3 scores (mental clarity, immune risk, physical output) and a short note:\n\n"${entry}"`
          }
        ]
      })
    });

    const data = await openaiResponse.json();
    const message = data.choices?.[0]?.message?.content ?? 'Analysis failed';

    console.log("OpenAI message:", message);

    return {
      statusCode: 200,
      body: JSON.stringify({ message })
    };

  } catch (err) {
    console.error("GPT request error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to analyze log' })
    };
  }
};