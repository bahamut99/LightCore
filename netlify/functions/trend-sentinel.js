const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function getStandardDeviation(numbers) {
    const n = numbers.length;
    if (n < 2) return 0;
    const mean = numbers.reduce((a, b) => a + b) / n;
    const variance = numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    return Math.sqrt(variance);
}

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
        // MODIFIED: Use the correct admin function to list all users
        const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
        
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

            if (logError || !logs || logs.length < 4) continue;

            const metrics = {
                clarity: logs.map(l => l.clarity_score).filter(s => s !== null),
                immune: logs.map(l => l.immune_score).filter(s => s !== null),
                physical: logs.map(l => l.physical_readiness_score).filter(s => s !== null),
            };

            for (const metricName in metrics) {
                const scores = metrics[metricName];
                if (scores.length < 4) continue; // Not enough data points for this specific metric
                
                const trendSlope = getTrend(scores);
                const volatility = getStandardDeviation(scores);

                const isSignificantTrend = trendSlope < -0.4;
                const isStableData = volatility < 2.5;

                if (isSignificantTrend && isStableData) { 
                    const persona = `You are the Trend Sentinel AI...`;
                    const prompt = `A high-confidence downward trend was detected...`;

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