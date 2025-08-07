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
        const tz = userTimezone || 'UTC';

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
        You are a world-class AI health analyst. Your process is to first think step-by-step inside a <reasoning> XML block. After the reasoning block, you will provide your final analysis as a single, valid JSON object and nothing else.
        **MISSION:** Analyze today's data within the broader **USER CONTEXT** to provide nuanced, trend-aware scores and notes.
        **SCORING RUBRIC & INSTRUCTIONS:**
        - Clarity Score: Base this on reported focus, energy, and the absence or presence of 'brain fog'.
        - Immune Score: Heavily weigh inferred stress (from the log text) and reported sleep quality as significant negative factors.
        - Physical Score: This score represents physical readiness and recovery. Be strict and analytical.
            - **Primary Factors (High Importance):**
                - Sleep: Poor or insufficient sleep (<6 hours) MUST result in a low score (< 5), regardless of subjective energy. Excellent sleep is a prerequisite for a high score.
                - Recovery Status: Look for words like "sore", "achy", "fatigued from yesterday's workout". High soreness MUST lower the score significantly to reflect the need for recovery. Conversely, mentions of "recovered", "fresh", or "rest day" are positive signals.
            - **Secondary Factors (Moderate Importance):**
                - Subjective Energy: Use reported energy ("energetic", "sluggish", "drained") to fine-tune the score, but it cannot override the primary factors.
                - Inferred Stress: High mental/emotional stress also negatively impacts physical readiness.
            - **Tertiary Factors (Minor Importance):**
                - Use mentions of good nutrition/hydration or high step counts as minor positive adjustments.
            - **High Scores (9-10) should be reserved for days where sleep, recovery, AND subjective energy are all clearly excellent.**
        - Score values are 1-10. Use this color map: 1-2: #ef4444, 3-4: #f97316, 5-6: #eab308, 7-8: #22c55e, 9-10: #3b82f6.
        - "notes" must be empathetic and should acknowledge the user's context.
        - "tags" must be a JSON array of 3-5 relevant, lowercase strings.
        ---
        **USER CONTEXT FOR TODAY'S ANALYSIS:**
        ${historyContext}
        ${goalContext}
        **TODAY'S DATA FOR ANALYSIS:**
        - User Log: "${log}"
        - Automated Health Data: ${healthDataString}
        Now, generate the <reasoning> block followed by the final JSON response for today's data.
        `;

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
            const errorBody = await aiResponse.text();
            throw new Error(`Gemini API error: ${aiResponse.status} ${errorBody}`);
        }

        const aiData = await aiResponse.json();
        let analysis;
        try {
            const rawText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error("AI returned an empty or invalid response structure.");
            analysis = JSON.parse(rawText);
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
        
        // --- PERFORMANCE OPTIMIZATION ---
        // Step 1: Ensure a context row exists. This creates it on the first log.
        await supabaseAdmin.rpc('upsert_lightcore_context', {
            p_user_id: user.id,
            p_new_log: newLogData
        });
        
        // Step 2: Prepend the new log to the array in a separate, clean step.
        await supabaseAdmin.rpc('prepend_to_recent_logs', {
            p_user_id: user.id,
            p_new_log_entry: newLogData
        });

        // --- Streak Counter Logic ---
        const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('streak_count, last_log_date').eq('id', user.id).single();
        if (profileError) throw new Error(`Could not fetch user profile: ${profileError.message}`);

        if (profile) {
            const now = new Date();
            const todayLocalString = now.toLocaleDateString('en-CA', { timeZone: tz });
            
            let newStreakCount = profile.streak_count || 0;
            
            if (profile.last_log_date) {
                const lastLogDate = new Date(profile.last_log_date);
                const lastLogLocalString = lastLogDate.toLocaleDateString('en-CA', { timeZone: tz });

                if (todayLocalString !== lastLogLocalString) {
                    const today = new Date(todayLocalString);
                    const lastLog = new Date(lastLogLocalString);
                    const diffTime = today - lastLog;
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays === 1) {
                        newStreakCount++;
                    } else {
                        newStreakCount = 1;
                    }
                }
            } else {
                newStreakCount = 1;
            }
            
            await supabaseAdmin.from('profiles').update({ 
                streak_count: newStreakCount, 
                last_log_date: now.toISOString()
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