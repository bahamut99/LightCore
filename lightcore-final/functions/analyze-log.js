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

        const { log, sleep_hours, sleep_quality } = JSON.parse(event.body);

        const { data: recentLogs } = await supabase
            .from('daily_logs')
            .select('created_at, clarity_score, immune_score, physical_readiness_score')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(3);

        const { data: activeGoal } = await supabase
            .from('goals')
            .select('goal_value')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();

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
        // ... (Non-critical health data fetch remains the same) ...

        const prompt = `
        You are a world-class AI health analyst. Your process is to first think step-by-step inside a <reasoning> XML block. After the reasoning block, you will provide your final analysis as a single, valid JSON object and nothing else.

        **MISSION:** Analyze today's data within the broader **USER CONTEXT** to provide nuanced, trend-aware scores and notes.

        **SCORING RUBRIC & INSTRUCTIONS:**
        - Clarity Score: Base this on reported focus, energy, and the absence or presence of 'brain fog'. Compare to recent history.
        - Immune Score: Heavily weigh inferred stress (from the log text) and reported sleep quality as significant negative factors.
        
        // --- NEW DETAILED PHYSICAL SCORE RUBRIC ---
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
        // --- END OF NEW RUBRIC ---

        - Score values are 1-10. Use this color map: 1-2: #ef4444, 3-4: #f97316, 5-6: #eab308, 7-8: #22c55e, 9-10: #3b82f6.
        - "notes" must be empathetic and should acknowledge the user's context.
        - "tags" must be a JSON array of 3-5 relevant, lowercase strings.

        ---
        **EXAMPLES TO LEARN FROM:**

        **Example 1:**
        * **Log:** "Slept a solid 8 hours and woke up feeling refreshed. Crushed my morning workout at the gym, then had a protein-packed smoothie. The deep work session on the Q3 report was incredibly focused; felt like I was in the zone for hours. Feeling optimistic."
        * **JSON Output:**
            \`\`\`json
            {
                "clarity": {"score": 9, "label": "Optimal", "color_hex": "#3b82f6"},
                "immune": {"score": 8, "label": "Good", "color_hex": "#22c55e"},
                "physical": {"score": 9, "label": "Optimal", "color_hex": "#3b82f6"},
                "notes": "It's clear that quality sleep is a major catalyst for your physical performance and mental clarity. Capitalizing on that rested state with a morning workout seems to create a powerful positive feedback loop for your day.",
                "tags": ["good-sleep", "workout", "deep-work", "high-energy", "nutrition"]
            }
            \`\`\`

        **Example 2:**
        * **Log:** "Barely slept, maybe 4-5 hours because of a late-night coffee and work stress. Feeling completely drained and foggy today. Skipped lunch to meet a deadline, which probably didn't help. My body feels sluggish and I have zero motivation for the gym."
        * **JSON Output:**
            \`\`\`json
            {
                "clarity": {"score": 3, "label": "Poor", "color_hex": "#f97316"},
                "immune": {"score": 3, "label": "Poor", "color_hex": "#f97316"},
                "physical": {"score": 2, "label": "Critical", "color_hex": "#ef4444"},
                "notes": "It sounds like a tough day, and the lack of sleep is clearly impacting all areas. Prioritizing a wind-down routine tonight, even a short one, could be the key to breaking this cycle and starting fresh tomorrow.",
                "tags": ["poor-sleep", "work-stress", "brain-fog", "low-energy", "skipped-meal"]
            }
            \`\`\`
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

            const jsonStart = rawText.indexOf('{');
            if (jsonStart === -1) {
                throw new Error("No JSON object found in the AI's response.");
            }
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
        const { data: recentLogsForContext } = await supabaseAdmin.from('daily_logs').select('id, created_at, log, clarity_score, immune_score, physical_readiness_score, sleep_hours, sleep_quality, tags').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
        await supabaseAdmin.from('lightcore_brain_context').upsert({ user_id: user.id, recent_logs: recentLogsForContext, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

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