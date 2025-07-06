const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Helper function to calculate standard deviation
function getStandardDeviation(numbers) {
    const n = numbers.length;
    if (n < 2) return 0;
    const mean = numbers.reduce((a, b) => a + b) / n;
    const variance = numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    return Math.sqrt(variance);
}

// Helper function to find the trend slope
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
    return slope;
}

exports.handler = async (event, context) => {
    console.log("--- Trend Sentinel Activated ---");
    try {
        const { data: users, error: userError } = await supabase.from('users').select('id');
        if (userError) throw new Error(`Error fetching users: ${userError.message}`);
        if (!users || users.length === 0) {
            console.log("No users to process. Exiting.");
            return { statusCode: 200, body: "No users to process." };
        }

        for (const user of users) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: logs, error: logError } = await supabase
                .from('daily_logs')
                .select('clarity_score, immune_score, physical_readiness_score')
                .eq('user_id', user.id)
                .gte('created_at', sevenDaysAgo.toISOString())
                .order('created_at', { ascending: true });

            if (logError || logs.length < 4) continue;

            const metrics = {
                clarity: logs.map(l => l.clarity_score),
                immune: logs.map(l => l.immune_score),
                physical: logs.map(l => l.physical_readiness_score),
            };

            for (const metricName in metrics) {
                const scores = metrics[metricName];
                
                // 1. Calculate the trend
                const trendSlope = getTrend(scores);
                
                // 2. Calculate volatility (standard deviation) for a confidence score
                const volatility = getStandardDeviation(scores);

                // 3. Only fire a nudge if the trend is clearly negative and the data isn't too noisy
                const isSignificantTrend = trendSlope < -0.4;
                const isStableData = volatility < 2.5; // Tunable: a lower number requires more stability

                if (isSignificantTrend && isStableData) { 
                    const persona = `You are the Trend Sentinel AI...`; // Full persona
                    const prompt = `A high-confidence downward trend was detected in a user's ${metricName} score...`; // Full prompt

                    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
                    const aiResponse = await fetch(geminiApiUrl, { /* ... */ });
                    
                    const aiData = await aiResponse.json();
                    const nudgeContent = JSON.parse(aiData.candidates[0].content.parts[0].text);
                    
                    await supabase.from('nudges').insert({
                        user_id: user.id,
                        headline: nudgeContent.headline,
                        body_text: nudgeContent.body_text,
                        suggested_actions: nudgeContent.suggested_actions
                    });

                    console.log(`Nudge generated for user ${user.id} for metric ${metricName}`);
                    break; 
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