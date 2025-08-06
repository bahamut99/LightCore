const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function ensureField(field) {
    const defaultValue = { score: 0, label: 'N/A', color_hex: '#6B7280' };
    if (!field) return defaultValue;
    return {
        score: field.score ?? defaultValue.score,
        label: field.label ?? defaultValue.label,
        color_hex: field.color_hex ?? defaultValue.color_hex
    };
}

exports.handler = async (event, context) => {
    try {
        if (!event.headers.authorization) {
            throw new Error('Not authorized. No auth header.');
        }
        const token = event.headers.authorization.split(' ')[1];
        
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });
        
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            throw new Error('User not found or token invalid.');
        }

        const { log, sleep_hours, sleep_quality, userTimezone } = JSON.parse(event.body);
        const tz = userTimezone || 'UTC'; // Fallback to UTC if not provided

        const { data: recentLogs } = await supabase.from('daily_logs').select('created_at, clarity_score, immune_score, physical_readiness_score').eq('user_id', user.id).order('created_at', { ascending: false }).limit(3);
        const { data: activeGoal } = await supabase.from('goals').select('goal_value').eq('user_id', user.id).eq('is_active', true).single();

        let historyContext = "No recent history available.";
        if (recentLogs && recentLogs.length > 0) {
            historyContext = "User's Recent Scores (for trend context):\n" + recentLogs.map((log, index) => {
                const day = index === 0 ? "Yesterday" : `${index + 1} days ago`;
                return `- ${day}: Clarity=${log.clarity_score}, Immune=${log.immune_score}, Physical=${log.physical_readiness_score}`;
            }).join('\n');
        }

        let goalContext = "User has no active weekly goal.";
        if (activeGoal) {
            goalContext = `User's active weekly goal is to log ${activeGoal.goal_value} days.`;
        }
        
        let healthDataString = "Not available";
        
        const prompt = `
        You are a world-class AI health analyst...
        [Omitting the long prompt string as it is unchanged]
        `;

        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const aiResponse = await fetch(geminiApiUrl, { /* ... Omitted for brevity ... */ });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`Gemini API error: ${aiResponse.status} ${errorBody}`);
        }

        const aiData = await aiResponse.json();
        let analysis;
        try {
            const rawText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error("AI returned an empty or invalid response structure.");
            const jsonStart = rawText.indexOf('{');
            if (jsonStart === -1) throw new Error("No JSON object found in the AI's response.");
            const jsonString = rawText.substring(jsonStart);
            analysis = JSON.parse(jsonString);
        } catch (parseError) {
            console.error("Failed to parse JSON from AI response:", parseError);
            throw new Error("Failed to parse AI response.");
        }

        const clarity = ensureField(analysis.clarity);
        const immune = ensureField(analysis.immune);
        const physical = ensureField(analysis.physical);

        const logEntry = {
            user_id: user.id, log,
            clarity_score: clarity.score, clarity_label: clarity.label, clarity_color: clarity.color_hex,
            immune_score: immune.score, immune_label: immune.label, immune_color: immune.color_hex,
            physical_readiness_score: physical.score, physical_readiness_label: physical.label, physical_readiness_color: physical.color_hex,
            ai_notes: analysis.notes || "No specific notes generated.",
            sleep_hours: sleep_hours || null, sleep_quality: sleep_quality || null,
            tags: analysis.tags || []
        };
        
        const { data: newLogData, error: dbError } = await supabase.from('daily_logs').insert(logEntry).select().single();
        if (dbError) throw new Error(`Supabase insert error: ${dbError.message}`);

        const supabaseAdmin = createAdminClient();
        
        // ... (lightcore_brain_context update logic remains the same)

        // --- THIS IS THE STREAK COUNTER FIX ---
        const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('streak_count, last_log_date').eq('id', user.id).single();
        if (profileError) throw new Error(`Could not fetch user profile: ${profileError.message}`);

        if (profile) {
            const now = new Date();
            // Get today's date string in the user's local timezone (e.g., "2025-08-06")
            const todayLocalString = now.toLocaleDateString('en-CA', { timeZone: tz });
            
            let newStreakCount = profile.streak_count || 0;
            
            if (profile.last_log_date) {
                const lastLogDate = new Date(profile.last_log_date);
                // Get the last log's date string in the user's local timezone
                const lastLogLocalString = lastLogDate.toLocaleDateString('en-CA', { timeZone: tz });

                if (todayLocalString !== lastLogLocalString) {
                    const today = new Date(todayLocalString);
                    const lastLog = new Date(lastLogLocalString);
                    const diffTime = today - lastLog;
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays === 1) {
                        newStreakCount++; // It was yesterday, increment streak
                    } else {
                        newStreakCount = 1; // It's been more than a day, reset streak
                    }
                }
                // If the date strings are the same, do nothing to the streak.
            } else {
                newStreakCount = 1; // This is the user's first log ever.
            }
            
            await supabaseAdmin.from('profiles').update({ 
                streak_count: newStreakCount, 
                last_log_date: now.toISOString() // Always store the full UTC timestamp
            }).eq('id', user.id);
        }

        return {
            statusCode: 200,
            body: JSON.stringify(newLogData),
        };

    } catch (error) {
        console.error('CRITICAL ERROR in analyze-log:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};