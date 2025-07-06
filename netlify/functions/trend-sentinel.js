exports.handler = async (event, context) => {
    console.log("--- Starting Gemini API Connection Test ---");
    try {
        const geminiKey = process.env.GEMINI_API_KEY;

        if (!geminiKey) {
            throw new Error("TEST FAILED: GEMINI_API_KEY environment variable is missing.");
        }
        console.log("Step 1: GEMINI_API_KEY found.");

        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        const testPrompt = "Briefly, what is the function of mitochondria?";

        console.log("Step 2: Calling Gemini API...");
        const aiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: testPrompt }] }]
            })
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`TEST FAILED: Gemini API returned an error. Status: ${aiResponse.status}. Body: ${errorBody}`);
        }

        console.log("Step 3: Gemini API call successful.");
        const aiData = await aiResponse.json();
        const responseText = aiData.candidates[0].content.parts[0].text;

        return {
            statusCode: 200,
            body: `SUCCESS: Connection to Gemini API worked. It responded with: "${responseText}"`
        };

    } catch (error) {
        console.error("--- TEST FAILED ---");
        console.error(error);
        return {
            statusCode: 500,
            body: `Error during Gemini API test: ${error.message}`
        };
    }
};