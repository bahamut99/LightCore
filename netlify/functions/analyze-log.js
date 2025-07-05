const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Not authorized: No token.');

        console.log('--- Testing fetch-health-data function ---');
        
        const healthResponse = await fetch('https://lightcorehealth.netlify.app/.netlify/functions/fetch-health-data', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const responseText = await healthResponse.text(); // Get raw text to avoid JSON parse errors
        
        console.log('Response from fetch-health-data:', responseText);

        // Return the raw data directly for debugging
        return {
            statusCode: 200,
            body: responseText,
        };

    } catch (error) {
        console.error('CRITICAL ERROR during test:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

// We don't need a timeout for this simple test