const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch'); // Re-added this critical dependency

const createAdminClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Supabase URL or Service Role Key is not set in environment variables.');
    }
    return createClient(supabaseUrl, serviceRoleKey);
};

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
    return isNaN(slope) ? 0 : slope;
}

exports.handler = async (event, context) => {
    console.log("--- Trend Sentinel Activated ---");
    try {
        const supabaseAdmin = createAdminClient();

        const { data: profiles, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id');
        
        if (profileError) throw new Error(`Error fetching profiles: ${profileError.message}`);
        if (!profiles || profiles.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ message: "No profiles to process." }) };
        }

        for (const profile of profiles) {
            const userId = profile.id;
            
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: recentNudges, error: nudgeError } = await supabaseAdmin
                .from('nudges')
                .select('id', { count: 'exact' })
                .eq('user_id', userId)
                .gte('created_at', twentyFourHoursAgo);

            if (nudgeError) {
                console.error(`Error checking recent nudges for user ${userId}:`, nudgeError.message);
                continue;
            }
            if (recentNudges.length > 0) {
                console.log(`Skipping user ${userId}: Nudge already sent within 24 hours.`);
                continue;
            }

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: logs, error: logError } = await supabaseAdmin
                .from('daily_logs')
                .select('clarity_score, immune_score, physical_readiness_score')
                .eq('user_id', userId)
                .gte('created_at', sevenDaysAgo.toISOString())
                .order('created_at', { ascending: true });

            if (logError || !logs || logs.length < 4) continue;

            const metrics = {
                Clarity: logs.map(l => l.clarity_score).filter(s => s != null),
                Immune: logs.map(l => l.immune_score).filter(s => s != null),
                Physical: logs.map(l => l.physical_readiness_score).filter(s => s != null),
            };

            for (const metricName in metrics) {
                const scores = metrics[metricName];
                if (scores.length < 4) continue;
                
                const trendSlope = getTrend(scores);
                const volatility = getStandardDeviation(scores);

                console.log(`User ${userId}, Metric: ${metricName}, Slope: ${trendSlope.toFixed(2)}, Volatility: ${volatility.toFixed(2)}`);

                const isSignificantTrend = trendSlope < -0.4;
                const isStableData = volatility < 2.5;

                if (isSignificantTrend && isStableData) { 
                    const persona = `You are the Trend Sentinel AI...`;
                    const prompt = `A high-confidence downward trend was detected...`;
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
                        console.warn(`Gemini API error for user ${userId}:`, await aiResponse.text());
                        continue;
                    }
                    
                    const aiData = await aiResponse.json();
                    let nudgeContent;
                    try {
                        const aiText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!aiText) {
                           console.warn("Gemini response missing expected format for user:", userId);
                           continue;
                        }
                        nudgeContent = JSON.parse(aiText);
                    } catch (e) {
                        console.warn(`Failed to parse Gemini output for user ${userId}:`, e);
                        continue;
                    }
                    
                    await supabaseAdmin.from('nudges').insert({
                        user_id: userId,
                        headline: nudgeContent.headline || "Trend Alert",
                        body_text: nudgeContent.body_text || "A trend was detected in your health data.",
                        suggested_actions: Array.isArray(nudgeContent.suggested_actions) ? nudgeContent.suggested_actions : []
                    });

                    console.log(`Nudge generated for user ${userId} for metric ${metricName}`);
                    break; 
                }
            }
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Trend Sentinel run complete." })
        };

    } catch (error) {
        console.error("CRITICAL ERROR in Trend Sentinel:", error.message, error.stack);
        return { statusCode: 500, body: `Error: ${error.message}` };
    }
};