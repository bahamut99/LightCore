const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

exports.handler = async (event, context) => {
  // Extract the authorization code from the query parameters
  const { code } = event.queryStringParameters;

  if (!code) {
    return {
      statusCode: 400,
      body: 'Error: Missing authorization code.',
    };
  }

  try {
    const params = new URLSearchParams({
      code: code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: 'https://lightcorehealth.netlify.app/.netlify/functions/google-health-auth-callback',
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const tokenData = await response.json();

    if (tokenData.error) {
        throw new Error(`Google token error: ${tokenData.error_description}`);
    }

    // For now, we'll just display the tokens to confirm it works.
    // In the next step, we will save these to the database.
    const successMessage = `
      <h1>Authentication Successful!</h1>
      <p>You can close this window and return to the app.</p>
      <p><strong>Next Step:</strong> We will now save these tokens to your user profile.</p>
      <pre>${JSON.stringify(tokenData, null, 2)}</pre>
    `;
    
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: successMessage,
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: `An unexpected error occurred: ${error.message}`,
    };
  }
};