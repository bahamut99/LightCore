const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Helper to create an admin client for updating the context table
const createAdminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Helper to format the raw context data into a clean string for the AI prompt
function formatContextForAI(context) {
    let formattedString = "Here is the user's current health context:\n\n";

    if (context.user_summary) {
        formattedString += `=== Your Previous Summary of the User ===\n"${context.user_summary}"\n\n`;
    }
    if (context.ai_persona_memo) {
        formattedString += `=== Your Internal Memos About This User ===\n"${context.ai_persona_memo}"\n\n`;
    }

    if (context.average_scores) {
        formattedString += "=== User's 7-Day Average Scores ===\n";
        formattedString += `Clarity: ${context.average_scores.clarity?.toFixed(1) || 'N/A'}, Immune: ${context.average_scores.immune?.toFixed(1) || 'N/A'}, Physical: ${context.average_scores.physical?.toFixed(1) || 'N/A'}\n\n`;
    }

    if (context.recent_logs) {
        formattedString += "=== User's Most Recent Logs & Scores ===\n";
        context.recent_logs.slice(0, 7).forEach(log => {
            const date = new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            formattedString += `[${date}] Scores(C/I/P): ${log.clarity_score}/${log.immune_score}/${log.physical_readiness_score} | Log: "${log.log.substring(0, 75)}..."\n`;
        });
        formattedString += "\n";
    }
    
    if (context.chrono_events) {
        formattedString += "=== User's Recent Timed Events (ChronoDeck) ===\n";
        context.chrono_events.slice(0, 15).forEach(event => {
             const date = new Date(event.event_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
             const time = new Date(event.event_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute:'2-digit' });
             formattedString += `- ${event.event_type} at ${time} on ${date}\n`;
        });
        formattedString += "\n";
    }

    if (context.recent_insights) {
        formattedString += "=== Past Insights You've Given to the User ===\n";
        context.recent_insights.forEach(insight => {
            formattedString += `- "${insight}"\n`;
        });
        formattedString += "\n";
    }
    
    if (context.trend_warnings) {
        formattedString += "=== Recent Trend Warnings You've Flagged ===\n";
        context.trend_warnings.forEach(warning => {
            formattedString += `- A downward trend in ${warning.metric} was detected on ${new Date(warning.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}\n`;
        });
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
        // 1. Read the entire memory context for the user
        const { data: contextData, error: contextError } = await supabase
            .from('lightcore_brain_context')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (contextError && contextError.code === 'PGRST116') {
             return { statusCode: 200, body: JSON.stringify({ guidance: { current_state: "Log data for a few days to start generating personalized guidance." } }) };
        }
        if (contextError) throw new Error(`Context fetch error: ${contextError.message}`);
        
        // 2. Format the context into a prompt
        const formattedContext = formatContextForAI(contextData);
        
        const prompt = `
You are Lightcore – a unified, personalized health AI guide. You are reviewing a user's complete health context. Your goal is to synthesize all of this information into a single, cohesive, and insightful guidance message that tells a story about their recent health journey.

Your entire response MUST be a single, valid JSON object with two top-level keys: "guidance_for_user" and "memory_update".

1.  "guidance_for_user": An object containing the message for the user. It must have these keys:
    - "current_state": (String) A single, clear sentence about the user's overall state this week.
    - "positives": (Array of strings) 1-2 sentences summarizing what is working well.
    - "concerns": (Array of strings) 1 sentence gently highlighting an area of concern or an emerging pattern.
    - "suggestions": (Array of strings) 1 actionable nudge or experiment based on the data.

2.  "memory_update": An object for your own internal memory. It must have these keys:
    - "new_user_summary": (String) A new 1-2 sentence summary of the user's journey to be stored for next time.
    - "new_ai_persona_memo": (String) A new 1-sentence private memo for yourself on what to focus on next for this user.

CONTEXT:
${formattedContext}
`;

        // 3. Call the AI for synthesis
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

        // 4. Write the new summary and memo back to the context table
        if(memoryUpdate) {
            const supabaseAdmin = createAdminClient();
            await supabaseAdmin
                .from('lightcore_brain_context')
                .upsert({
                    user_id: user.id,
                    user_summary: memoryUpdate.new_user_summary,
                    ai_persona_memo: memoryUpdate.new_ai_persona_memo,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
        }

        // 5. Return only the user-facing guidance to the front-end
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