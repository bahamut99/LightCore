const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    console.log("--- Starting listUsers() Command Test ---");
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error("TEST FAILED: Supabase URL or Service Role Key is missing.");
        }
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        console.log("Step 1: Admin client created.");

        console.log("Step 2: Attempting to call listUsers()...");
        const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers();

        if (userError) {
            // Throw the specific error from Supabase if it exists
            throw userError;
        }
        
        console.log(`Step 3: listUsers() successful. Found ${users.length} user(s).`);

        return {
            statusCode: 200,
            body: `SUCCESS: The listUsers() command worked. Found ${users.length} user(s). The function can now be fully restored.`
        };

    } catch (error) {
        console.error("--- TEST FAILED ---");
        console.error("Full error object:", JSON.stringify(error, null, 2));
        return {
            statusCode: 500,
            body: `Error during listUsers() test: ${error.message}`
        };
    }
};