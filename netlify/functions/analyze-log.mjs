// netlify/functions/analyze-log.js
import { config } from 'dotenv';
config();

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { entry } = req.body;

  if (!entry) {
    return res.status(400).json({ error: 'Missing log entry' });
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

    res.status(200).json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to analyze log' });
  }
};
}