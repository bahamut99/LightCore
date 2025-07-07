const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// This helper function creates a dedicated admin client
const createAdminClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Supabase URL or Service Role Key is not set in environment variables.');
    }
    return createClient(supabaseUrl, serviceRoleKey);
};

// Helper function to calculate standard deviation for volatility
function getStandardDeviation(numbers) {
    const n = numbers.length;
    if (n < 2) return 0;
    const mean = numbers.reduce((a, b) => a + b) / n;
    const variance = numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    return Math.sqrt(variance);
}

// Helper function to find the trend slope using linear regression
function getTrend(scores) {
    if (scores.length < 3) return 0;
    let n = scores.length;
    let sum_x = 0, sum_y = 0, sum_xy = 0, sum_xx = 0;
    for (let i = 0; i < n; i++) {
        sum_x += i;
        sum_y += scores[i];
        sum_xy += (i * scores[i]);
        sum_xx += (i * i);
    }
    const slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
    return isNaN(slope) ? 0 : slope;
}

// Main handler for the scheduled function
exports.handler = async (event, context) => {
    console.log("--- Trend Sentinel Activated ---");
    try {
        const supabaseAdmin = createAdminClient();

        // Fetch all user profiles to process
        const { data: profiles, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id');
        
        if (profileError) throw new Error(`Error fetching profiles: ${profileError.message}`);
        if (!profiles || profiles.length === 0) {
            console.log("No profiles to process. Exiting.");
            return { statusCode: 200, body: "No profiles to process." };
        }

        for (const profile of profiles) {
            const userId = profile.id;
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: logs, error: logError } = await supabaseAdmin
                .from('daily_logs')
                .select('clarity_score, immune_score, physical_readiness_score')
                .eq('user_id', userId)
                .gte('created_at', sevenDaysAgo.toISOString())
                .order('created_at', { ascending: true });

            if (logError) {
                console.error(`Error fetching logs for user ${userId}:`, logError.message);
                continue; // Skip to the next user
            }

            if (!logs || logs.length < 4) {
                console.log(`Skipping user ${userId}: Not enough logs for trend analysis.`);
                continue;
            }

            const metrics = {
                Clarity: logs.map(l => l.clarity_score).filter(s => s !== null && s !== undefined),
                Immune: logs.map(l => l.immune_score).filter(s => s !== null && s !== undefined),
                Physical: logs.map(l => l.physical_readiness_score).filter(s => s !== null && s !== undefined),
            };

            for (const metricName in metrics) {
                const scores = metrics[metricName];
                if (scores.length < 4) continue;
                
                const trendSlope = getTrend(scores);
                const volatility = getStandardDeviation(scores);

                const isSignificantTrend = trendSlope < -0.4;
                const isStableData = volatility < 2.5;

                if (isSignificantTrend && isStableData) { 
                    const persona = `You are the Trend Sentinel AI for a health app called LightCore. You detect negative trends and report them with a clinical, authoritative, and confident tone.`;
                    const prompt = `A high-confidence downward trend was detected in a user's ${metricName} score, with a slope of ${trendSlope.toFixed(2)} over the last 7 days. Generate a JSON object with three keys: "headline" (a concise alert, e.g., "📉 Trend Alert: Downward Shift in Physical Readiness"), "body_text" (an authoritative, clinical explanation of what this might mean, without using emotional language), and "suggested_actions" (an array of 2-3 brief, actionable steps like a doctor would provide). Address the user directly as "you". Do not use emojis.`;

                    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
                    
                    const aiResponse = await fetch(geminiApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: { responseMimeType: "application/json" }
                        })
                    });
                    
                    if (!aiResponse.ok) {
                        console.error(`Gemini API error for user ${userId}:`, await aiResponse.text());
                        continue;
                    }
                    
                    const aiData = await aiResponse.json();
                    const nudgeContent = JSON.parse(aiData.candidates[0].content.parts[0].text);
                    
                    await supabaseAdmin.from('nudges').insert({
                        user_id: userId,
                        headline: nudgeContent.headline,
                        body_text: nudgeContent.body_text,
                        suggested_actions: nudgeContent.suggested_actions
                    });

                    console.log(`Nudge generated for user ${userId} for metric ${metricName}`);
                    break; // Only generate one nudge per user per day
                }
            }
        }
        
        console.log("--- Trend Sentinel run complete ---");
        return { statusCode: 200, body: "Trend Sentinel run complete." };

    } catch (error) {
        console.error("CRITICAL ERROR in Trend Sentinel:", error.message, error.stack);
        return { statusCode: 500, body: `Error: ${error.message}` };
    }
};