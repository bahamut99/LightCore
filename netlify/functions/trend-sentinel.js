const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Initialize Supabase with the admin key to access all user data
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Simple linear regression to find the slope of a trend
function getTrend(scores) {
    if (scores.length < 3) return 0; // Not enough data for a trend
    let n = scores.length;
    let sum_x = 0, sum_y = 0, sum_xy = 0, sum_xx = 0;
    for (let i = 0; i < n; i++) {
        sum_x += i;
        sum_y += scores[i];
        sum_xy += (i * scores[i]);
        sum_xx += (i * i);
    }
    const slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
    return slope;
}

// Main handler for the scheduled function
exports.handler = async (event, context) => {
    console.log("--- Trend Sentinel Activated ---");

    try {
        // 1. Get all active users
        const { data: users, error: userError } = await supabase
            .from('users') // Assuming you have a public 'users' table or view
            .select('id');
        
        if (userError) throw new Error(`Error fetching users: ${userError.message}`);
        if (!users || users.length === 0) {
            console.log("No users to process. Exiting.");
            return { statusCode: 200, body: "No users to process." };
        }

        // 2. Loop through each user to analyze their trends
        for (const user of users) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: logs, error: logError } = await supabase
                .from('daily_logs')
                .select('clarity_score, immune_score, physical_readiness_score')
                .eq('user_id', user.id)
                .gte('created_at', sevenDaysAgo.toISOString())
                .order('created_at', { ascending: true });

            if (logError) {
                console.error(`Error fetching logs for user ${user.id}:`, logError.message);
                continue; // Skip to the next user
            }

            if (logs.length < 4) continue; // Need at least 4 data points to spot a trend

            // 3. Analyze trends for each metric
            const trends = {
                clarity: getTrend(logs.map(l => l.clarity_score)),
                immune: getTrend(logs.map(l => l.immune_score)),
                physical: getTrend(logs.map(l => l.physical_readiness_score)),
            };

            // 4. If a negative trend is found, generate a nudge
            for (const metric in trends) {
                // A slope of -0.5 means the score is dropping by half a point per day on average
                if (trends[metric] < -0.4) { 
                    const persona = `You are the Trend Sentinel AI for a health app called LightCore.`;
                    const prompt = `A user's ${metric} score has a negative trend slope of ${trends[metric].toFixed(2)} over the last 7 days. Generate a JSON object with three keys: "headline" (a concise alert, e.g., "📉 Downward Trend Detected in Physical Output"), "body_text" (an authoritative, clinical explanation of what this might mean), and "suggested_actions" (an array of 2-3 brief, actionable steps). Address the user directly as "you". Do not use emojis.`;

                    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
                    const aiResponse = await fetch(geminiApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: { responseMimeType: "application/json" }
                        })
                    });
                    
                    const aiData = await aiResponse.json();
                    const nudgeContent = JSON.parse(aiData.candidates[0].content.parts[0].text);
                    
                    // 5. Save the nudge to the database
                    await supabase.from('nudges').insert({
                        user_id: user.id,
                        headline: nudgeContent.headline,
                        body_text: nudgeContent.body_text,
                        suggested_actions: nudgeContent.suggested_actions
                    });

                    console.log(`Nudge generated for user ${user.id} for metric ${metric}`);
                    break; // Only generate one nudge per user per day to avoid spam
                }
            }
        }
        
        console.log("--- Trend Sentinel run complete ---");
        return { statusCode: 200, body: "Trend Sentinel run complete." };

    } catch (error) {
        console.error("CRITICAL ERROR in Trend Sentinel:", error.message);
        return { statusCode: 500, body: `Error: ${error.message}` };
    }
};