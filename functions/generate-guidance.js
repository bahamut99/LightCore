const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function formatContextForAI(context) {
    let formattedString = "Here is a summary of the user's recent health data:\n\n";

    if (context.user_summary) {
        formattedString += `=== Your Previous Summary of the User ===\n"${context.user_summary}"\n\n`;
    }
    if (context.ai_persona_memo) {
        formattedString += `=== Your Internal Memos About This User ===\n"${context.ai_persona_memo}"\n\n`;
    }

    if (context.recent_logs && context.recent_logs.length > 0) {
        formattedString += "=== User's Most Recent Logs & Scores ===\n";
        context.recent_logs.slice(0, 7).forEach(log => {
            const date = new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            let scores = `Clarity: ${log.clarity_score || 'N/A'}, Immune: ${log.immune_score || 'N/A'}, Physical: ${log.physical_readiness_score || 'N/A'}`;
            formattedString += `[${date}] Scores: ${scores} | Log: "${log.log.substring(0, 75)}..."\n`;
        });
        formattedString += "\n";
    }
    
    if (context.chrono_events && context.chrono_events.length > 0) {
        formattedString += "=== User's Recent Timed Events (ChronoDeck) ===\n";
        context.chrono_events.slice(0, 15).forEach(event => {
            const date = new Date(event.event_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const time = new Date(event.event_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute:'2-digit' });
            formattedString += `- ${event.event_type} at ${time} on ${date}\n`;
        });
        formattedString += "\n";
    }

    if (context.recent_insights && context.recent_insights.length > 0) {
        formattedString += "=== Past Insights You've Already Given ===\n";
        formattedString += "Avoid repeating these points.\n";
        context.recent_insights.forEach(insight => {
            formattedString += `- "${insight}"\n`;
        });
        formattedString += "\n";
    }
    
    return formattedString;
}

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    try {
        const { data: contextData, error: contextError } = await supabase
            .from('lightcore_brain_context')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (contextError || !contextData) {
            console.log("No context found for user, waiting for analyze-log to create it.");
            return { statusCode: 200, body: JSON.stringify({ guidance: { current_state: "Log data for a few days to start generating personalized guidance." } }) };
        }
        
        const formattedContext = formatContextForAI(contextData);
        
        const prompt = `You are Lightcore – a unified, personalized health AI guide. You are reviewing a user's complete health context. Your goal is to synthesize this information into a single, cohesive, and insightful guidance message that tells a story about their recent health journey.

Your entire response MUST be a single, valid JSON object with two top-level keys: "guidance_for_user" and "memory_update".

1.  "guidance_for_user": An object for the user. It must have these keys:
    - "current_state": (String) A single, clear sentence summarizing the user's overall state this week.
    - "positives": (Array of strings) 1-2 sentences summarizing what is working well.
    - "concerns": (Array of strings) 1 sentence gently highlighting an area of concern or an emerging pattern.
    - "suggestions": (Array of strings) 1 actionable nudge or experiment based on the data.

2.  "memory_update": An object for your own internal memory. It must have these keys:
    - "new_user_summary": (String) A new 1-2 sentence summary of the user's journey to be stored for next time.
    - "new_ai_persona_memo": (String) A new 1-sentence private memo for yourself on what to focus on next for this user.

---
**SUGGESTION GUIDELINES (CRITICAL):**
-   **BE APP-AWARE:** Suggestions MUST encourage the use of LightCore's features. Instead of "track your food," say "Try using the 'Meal' event in your daily log to see how timing affects your energy."
-   **BE SPECIFIC:** Propose a small, actionable experiment for the next 1-3 days. Instead of "get more sleep," suggest "Let's try an experiment: For the next 2 nights, aim to be in bed by 10:30 PM and see how it impacts your 'Clarity' score."
-   **GOOD EXAMPLES:**
    -   "For the next 3 days, try logging your 'Caffeine' intake in your daily log. Let's see if we can find a pattern between timing and your sleep quality scores."
    -   "You mentioned 'project deadline' several times. Try adding a '#work' tag to those logs so we can track its impact on your 'Clarity' over time."
-   **NEGATIVE CONSTRAINTS:**
    -   **NEVER** suggest using another app, journal, or tool. The user is using LightCore.
    -   **AVOID** generic, non-actionable advice like "exercise more."
    -   **DO NOT** give medical advice. Frame suggestions around data collection and pattern discovery.
---

CRITICAL INSTRUCTION: Analyze the provided data context below. Based on your analysis, generate the JSON object as described above. Do not include any other text, preambles, or explanations in your response.

DATA CONTEXT:
${formattedContext}
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
        const guidanceText = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!guidanceText) throw new Error("No guidance was returned by the AI.");
        
        const fullResponse = JSON.parse(guidanceText);
        const guidance = fullResponse.guidance_for_user;
        const memoryUpdate = fullResponse.memory_update;

        if(memoryUpdate) {
            const supabaseAdmin = createAdminClient();
            await supabaseAdmin
                .from('lightcore_brain_context')
                .update({
                    user_summary: memoryUpdate.new_user_summary,
                    ai_persona_memo: memoryUpdate.new_ai_persona_memo,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ guidance }),
        };

    } catch (error) {
        console.error('Error in generate-guidance function:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Sorry, I couldn't generate guidance right now." }),
        };
    }
};