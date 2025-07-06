const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    console.log("--- Diagnostic Run Started ---");
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error("Missing Supabase environment variables.");
        }
        console.log("Step 1: Environment variables present.");

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        console.log("Step 2: Supabase admin client created.");

        const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers();
        if (userError) throw userError;
        console.log(`Step 3: listUsers() successful. Found ${users.length} user(s).`);

        for (const user of users) {
            console.log(`Processing user: ${user.id}`);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: logs, error: logError } = await supabaseAdmin
                .from('daily_logs')
                .select('clarity_score')
                .eq('user_id', user.id)
                .gte('created_at', sevenDaysAgo.toISOString());
            
            if (logError) {
                console.error(`Error fetching logs for user ${user.id}:`, logError.message);
                continue;
            }
            console.log(`Found ${logs.length} logs for user ${user.id}.`);
        }
        
        console.log("--- Diagnostic Run Complete ---");
        return { statusCode: 200, body: "Diagnostic run completed successfully. Check logs." };

    } catch (error) {
        console.error("--- DIAGNOSTIC CRITICAL ERROR ---");
        console.error("Error Message:", error.message);
        console.error("Full Error:", JSON.stringify(error, null, 2));
        return { statusCode: 500, body: `Error: ${error.message}` };
    }
};