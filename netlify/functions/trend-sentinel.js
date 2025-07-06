const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    console.log("--- Starting Admin Client Connection Test ---");
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error("TEST FAILED: Supabase URL or Service Role Key environment variable is missing.");
        }
        console.log("Step 1: Environment variables found.");

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        
        if (supabaseAdmin) {
            console.log("Step 2: Supabase admin client created successfully.");
        } else {
            throw new Error("TEST FAILED: Supabase client object could not be created.");
        }

        // We will test the listUsers command in the next step.
        // For now, we just confirm the client can be created.

        return {
            statusCode: 200,
            body: "SUCCESS: Supabase admin client was created. The next step is to test the listUsers() command."
        };

    } catch (error) {
        console.error("--- TEST FAILED ---");
        console.error(error);
        return {
            statusCode: 500,
            body: `Error during connection test: ${error.message}`
        };
    }
};