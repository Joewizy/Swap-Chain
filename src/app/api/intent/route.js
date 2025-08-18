import OpenAI from "openai";

const token = process.env.OPEN_API_KEY;
if (!token) throw new Error("No token found");

const client = new OpenAI({
  baseURL: "https://models.github.ai/inference",
  apiKey: token
});

// Enhanced system prompt with better context understanding
const systemPrompt = `You are a structured API that converts natural-language crypto swap/bridge/transfer requests into JSON.

SUPPORTED CHAINS:
- Solana: "solana"
- Ethereum: "ethereum", "mainnet", "eth"
- Base: "base"
- Arbitrum: "arbitrum", "arb"
- Polygon: "polygon", "matic"
- Optimism: "optimism", "op"
- BSC: "bsc", "binance"
- Avalanche: "avalanche", "avax"

SUPPORTED TOKENS:
- ETH, WETH, SOL, USDC, USDT, MATIC, AVAX, BNB, OP, ARB, etc.

RESPONSE TYPES:

1. COMPLETE INTENT (when all info is clear):
{
  "type": "intent",
  "sourceChain": "solana",
  "targetChain": "base",
  "token": "SOL",
  "amount": 10,
  "amountUnit": "SOL",
  "intentType": "bridge",
  "confidence": 0.95,
  "actionType": "transfer"
}

2. PARTIAL INTENT (missing info, but clear intent):
{
  "type": "partial",
  "sourceChain": "solana",
  "targetChain": null,
  "token": "SOL",
  "amount": 10,
  "amountUnit": "SOL",
  "missing": ["targetChain"],
  "clarifyMessage": "Which EVM chain would you like to send your SOL to? (base, arbitrum, ethereum, polygon, etc.)",
  "confidence": 0.8,
  "actionType": "transfer"
}

3. CLARIFICATION NEEDED (unclear or greeting):
{
  "type": "clarify",
  "clarifyMessage": "I can help you swap or bridge crypto between chains. What would you like to do?",
  "confidence": 0.2,
  "suggestions": ["Swap 1 ETH from ethereum to base", "Bridge 100 USDC from polygon to arbitrum"]
}

4. ROUTE SUGGESTION (when user wants to know "how"):
{
  "type": "route_suggestion",
  "sourceChain": "base",
  "targetChain": "arbitrum",
  "token": "ETH",
  "amount": 1,
  "amountUnit": "ETH",
  "suggestedRoute": "Use a cross-chain bridge like Across or Hop Protocol",
  "estimatedTime": "5-15 minutes",
  "estimatedFees": "~$2-5 in gas fees",
  "confidence": 0.9,
  "actionType": "route_info"
}

INTENT DETECTION RULES:
- "I have X token, how do I send to Y" = partial intent (missing target chain if Y is vague like "EVM")
- "Transfer/Send/Move X from A to B" = complete intent
- "How do I transfer X from A to B" = route suggestion
- "Swap X for Y" = swap intent
- "Bridge X from A to B" = bridge intent
- Greetings/questions = clarify

Always normalize chain names to the supported list above.`;

// Enhanced validation functions
function isCompleteIntent(obj) {
  return obj?.type === "intent" &&
         typeof obj.sourceChain === "string" && obj.sourceChain.length > 0 &&
         typeof obj.targetChain === "string" && obj.targetChain.length > 0 &&
         typeof obj.token === "string" && obj.token.length > 0 &&
         (typeof obj.amount === "number" || typeof obj.amount === "string") &&
         ["swap", "bridge", "transfer"].includes(obj.intentType);
}

function isPartialIntent(obj) {
  return obj?.type === "partial" &&
         Array.isArray(obj.missing) &&
         obj.missing.length > 0 &&
         typeof obj.clarifyMessage === "string";
}

function isRouteSuggestion(obj) {
  return obj?.type === "route_suggestion" &&
         typeof obj.suggestedRoute === "string" &&
         obj.actionType === "route_info";
}

function normalizeChainName(chain) {
  if (!chain) return null;
  
  const chainMap = {
    'eth': 'ethereum',
    'mainnet': 'ethereum',
    'arb': 'arbitrum',
    'op': 'optimism',
    'matic': 'polygon',
    'avax': 'avalanche',
    'binance': 'bsc'
  };
  
  const normalized = chain.toLowerCase();
  return chainMap[normalized] || normalized;
}

// Context tracking for follow-up questions
let conversationContext = new Map();

export async function POST(req) {
  try {
    const body = await req.json();
    const { message: userMessage, sessionId = 'default' } = body;
    
    if (!userMessage) {
      return Response.json({ error: "No message provided" }, { status: 400 });
    }

    // Get conversation context
    const context = conversationContext.get(sessionId) || {};
    
    // Build enhanced prompt with context
    let contextPrompt = systemPrompt;
    if (context.lastIntent) {
      contextPrompt += `\n\nCONVERSATION CONTEXT:
Previous partial intent: ${JSON.stringify(context.lastIntent)}
Use this context to fill in missing information from the current message.`;
    }
    
    const response = await client.chat.completions.create({
      messages: [
        { role: "system", content: contextPrompt },
        { role: "user", content: userMessage }
      ],
      model: "openai/gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 800,
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
        clarifyMessage: "I couldn't understand that. Could you rephrase? Example: 'I have 10 SOL, how do I send it to Base?'",
        confidence: 0.0
      });
    }

    // Normalize chain names
    if (parsed.sourceChain) parsed.sourceChain = normalizeChainName(parsed.sourceChain);
    if (parsed.targetChain) parsed.targetChain = normalizeChainName(parsed.targetChain);

    // Handle different response types
    if (isCompleteIntent(parsed) && Number(parsed.confidence ?? 0) >= 0.7) {
      parsed.amount = Number(parsed.amount);
      
      // Clear context on successful intent
      conversationContext.delete(sessionId);
      
      return Response.json({
        ...parsed,
        message: `Got it! You want to ${parsed.intentType} ${parsed.amount} ${parsed.token} from ${parsed.sourceChain} to ${parsed.targetChain}.`
      });
    }

    if (isPartialIntent(parsed) && Number(parsed.confidence ?? 0) >= 0.6) {
      // Store partial intent for context
      conversationContext.set(sessionId, { 
        lastIntent: parsed,
        timestamp: Date.now() 
      });
      
      if (parsed.amount) parsed.amount = Number(parsed.amount);
      
      return Response.json({
        ...parsed,
        sessionId
      });
    }

    if (isRouteSuggestion(parsed) && Number(parsed.confidence ?? 0) >= 0.7) {
      if (parsed.amount) parsed.amount = Number(parsed.amount);
      
      return Response.json({
        ...parsed,
        message: `To transfer ${parsed.amount} ${parsed.token} from ${parsed.sourceChain} to ${parsed.targetChain}:`
      });
    }

    // Handle follow-up responses with context
    if (context.lastIntent && userMessage.toLowerCase().includes('base') || 
        userMessage.toLowerCase().includes('arbitrum') || 
        userMessage.toLowerCase().includes('ethereum') ||
        userMessage.toLowerCase().includes('polygon')) {
      
      const lastIntent = context.lastIntent;
      const targetChain = normalizeChainName(userMessage.toLowerCase().split(' ').find(word => 
        ['base', 'arbitrum', 'ethereum', 'polygon', 'optimism'].includes(word)
      ));

      if (targetChain && lastIntent.missing?.includes('targetChain')) {
        conversationContext.delete(sessionId);
        
        return Response.json({
          type: "intent",
          sourceChain: lastIntent.sourceChain,
          targetChain: targetChain,
          token: lastIntent.token,
          amount: Number(lastIntent.amount),
          amountUnit: lastIntent.amountUnit,
          intentType: lastIntent.intentType || "bridge",
          confidence: 0.95,
          actionType: "transfer",
          message: `Perfect! You want to ${lastIntent.intentType || 'bridge'} ${lastIntent.amount} ${lastIntent.token} from ${lastIntent.sourceChain} to ${targetChain}.`
        });
      }
    }

    // Default clarification response
    if (parsed.type === "clarify" || Number(parsed.confidence ?? 0) < 0.6) {
      return Response.json({
        type: "clarify",
        clarifyMessage: parsed.clarifyMessage || "I can help you swap or bridge crypto between chains. What would you like to do?",
        confidence: Number(parsed.confidence ?? 0),
        suggestions: [
          "I have 10 SOL, how do I send it to Base?",
          "Transfer 1 ETH from Base to Arbitrum",
          "Swap 100 USDC from Polygon to Ethereum"
        ]
      });
    }

    // Fallback
    return Response.json({
      type: "clarify",
      clarifyMessage: "I couldn't extract a clear request. Try: 'I have 10 SOL, send it to Base' or 'How do I transfer 1 ETH from Base to Arbitrum?'",
      confidence: 0.0,
      suggestions: [
        "I have [amount] [token], send it to [chain]",
        "Transfer [amount] [token] from [chain] to [chain]",
        "How do I bridge [token] from [chain] to [chain]?"
      ]
    });

  } catch (error) {
    console.error('Error processing intent:', error);
    return Response.json({ 
      error: "Failed to process intent",
      type: "error"
    }, { status: 500 });
  }
}

// Cleanup old contexts (run periodically)
setInterval(() => {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  
  for (const [sessionId, context] of conversationContext.entries()) {
    if (now - context.timestamp > THIRTY_MINUTES) {
      conversationContext.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes