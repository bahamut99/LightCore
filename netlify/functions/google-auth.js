const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

// Configuration
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'https://lightcorehealth.netlify.app/.netlify/functions/google-auth';

// --- Main Handler ---
exports.handler = async (event, context) => {
    // If the 'code' parameter is present, we are handling the callback from Google.
    if (event.queryStringParameters.code) {
        return handleCallback(event.queryStringParameters.code);
    }
    // Otherwise, we are starting the authentication process.
    return startAuth();
};

// --- Function to start the authentication flow ---
function startAuth() {
    const scopes = [
        'https://www.googleapis.com/auth/fitness.activity.readonly',
        'https://www.googleapis.com/auth/fitness.sleep.readonly',
        'https://www.googleapis.com/auth/fitness.blood_pressure.readonly',
        'https://www.googleapis.com/auth/fitness.blood_glucose.readonly'
    ];

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: scopes.join(' '),
        access_type: 'offline',
        prompt: 'consent'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    // Redirect the user to Google
    return {
        statusCode: 302,
        headers: { Location: authUrl },
    };
}

// --- Function to handle the callback from Google ---
async function handleCallback(code) {
    try {
        const params = new URLSearchParams({
            code: code,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
        });

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });

        const tokenData = await response.json();

        if (tokenData.error) {
            throw new Error(`Google token error: ${tokenData.error_description}`);
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<h1>Authentication Successful!</h1><p>You can now close this tab.</p><pre>${JSON.stringify(tokenData, null, 2)}</pre>`,
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: `An unexpected error occurred: ${error.message}`,
        };
    }
}