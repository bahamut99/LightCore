const { URLSearchParams } = require('url');

exports.handler = async (event, context) => {
  const scopes = [
    'https://www.googleapis.com/auth/fitness.activity.readonly',
    'https://www.googleapis.com/auth/fitness.sleep.readonly',
    'https://www.googleapis.com/auth/fitness.blood_pressure.readonly',
    'https://www.googleapis.com/auth/fitness.blood_glucose.readonly'
  ];

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    // IMPORTANT: This now points to our new callback function name
    redirect_uri: 'https://lightcorehealth.netlify.app/.netlify/functions/auth-callback',
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent'
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return {
    statusCode: 302,
    headers: {
      Location: authUrl,
    },
  };
};