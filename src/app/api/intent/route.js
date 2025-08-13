import OpenAI from "openai";

const token = process.env.OPEN_API_KEY;
if (!token) throw new Error("No token found");

const client = new OpenAI({
  baseURL: "https://models.github.ai/inference",
  apiKey: token
});

const systemPrompt = `You are a structured API that converts natural-language swap/bridge requests into JSON.

Rules:
- Only respond with valid JSON (no surrounding text).
- If the user clearly expresses a swap/bridge intent, return:
  {
    "type": "intent",
    "sourceChain": "...",
    "targetChain": "...",
    "token": "...",
    "amount": 100,
    "amountUnit": "ETH",
    "intentType": "swap",
    "confidence": 0.0-1.0
  }

- If you are NOT confident (unclear, greeting, question, or non-swap request), return:
  {
    "type": "clarify",
    "clarifyMessage": "A short question asking for the missing info (one sentence).",
    "confidence": 0.0-1.0
  }

Examples:
User: "Swap 0.5 ETH from sepolia to base-sepolia"
-> {"type": "intent", "sourceChain": "sepolia", "targetChain": "base-sepolia", "token": "ETH", "amount": 0.5, "amountUnit": "ETH", "intentType": "swap", "confidence": 0.98}

User: "What can you do for me?"
-> {"type": "clarify", "clarifyMessage": "I can parse swap/bridge requests — do you want to swap or bridge funds? If so please say e.g. 'Swap 1 ETH from sepolia to base-sepolia'.", "confidence": 0.9}`;

function isValidIntent(obj) {
  return obj?.type === "intent" &&
         typeof obj.sourceChain === "string" && obj.sourceChain.length > 0 &&
         typeof obj.targetChain === "string" && obj.targetChain.length > 0 &&
         typeof obj.token === "string" && obj.token.length > 0 &&
         (typeof obj.amount === "number" || typeof obj.amount === "string") &&
         (obj.intentType === "swap" || obj.intentType === "bridge");
}

export async function POST(req) {
  try {
    const body = await req.json();
    const userMessage = body.message;
    
    if (!userMessage) {
      return Response.json({ error: "No message provided" }, { status: 400 });
    }
    
    const response = await client.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      model: "openai/gpt-4o-mini",
      temperature: 0.0,
      max_tokens: 500,
      top_p: 1,
      response_format: { type: "json_object" }
    });
    
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from model");

    let parsed;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch (e) {
      return Response.json({
        type: "clarify",
        clarifyMessage: "I couldn't understand that. Could you rephrase? Example: 'Swap 1 ETH from mainnet to base'.",
        confidence: 0.0
      });
    }

    // Validate the structured output
    if (isValidIntent(parsed) && Number(parsed.confidence ?? 0) >= 0.7) {
      parsed.amount = Number(parsed.amount);
      return Response.json(parsed);
    }

    // If the model returned type: "clarify" or confidence low, return the clarify JSON
    if (parsed.type === "clarify" || Number(parsed.confidence ?? 0) < 0.7) {
      return Response.json({
        type: "clarify",
        clarifyMessage: parsed.clarifyMessage || "I didn't detect a swap intent. Do you want to swap or bridge funds? Example: 'Swap 100 ETH from mainnet to base'.",
        confidence: Number(parsed.confidence ?? 0)
      });
    }

    // Fallback generic clarification
    return Response.json({
      type: "clarify",
      clarifyMessage: "I couldn't extract a clear swap/bridge request. Try: 'Swap 0.01 ETH from mainnet to base'.",
      confidence: 0.0
    });

  } catch (error) {
    console.error('Error processing intent:', error);
    return Response.json({ error: "Failed to process intent" }, { status: 500 });
  }
}
