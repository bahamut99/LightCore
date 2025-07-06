exports.handler = async (event, context) => {
    console.log("--- Starting Environment Variable Check ---");
    
    const variables = {
        SUPABASE_URL: process.env.SUPABASE_URL ? 'Exists' : 'MISSING!',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'Exists' : 'MISSING!',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Exists' : 'MISSING!',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'Exists' : 'MISSING!',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Exists (Legacy)' : 'Not Set (Okay)'
    };
    
    console.log("Environment Variable Status:", variables);
    
    const responseBody = `
        <h1>Environment Variable Check</h1>
        <p>This page checks if the function can access the required secret keys from your Netlify settings.</p>
        <pre>${JSON.stringify(variables, null, 2)}</pre>
        <p>If any key is marked as 'MISSING!', please double-check the variable name in your Netlify site settings for typos.</p>
    `;
    
    return {
        statusCode: 200,
        body: responseBody,
        headers: { 'Content-Type': 'text/html' },
    };
};