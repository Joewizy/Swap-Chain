// import dotenv from "dotenv";
// dotenv.config();

import OpenAI from "openai";

const token = process.env.OPEN_API_KEY;
if (!token) throw new Error("No token found");

export async function main() {

  const client = new OpenAI({
    baseURL: "https://models.github.ai/inference",
    apiKey: token
  });

  const response = await client.chat.completions.create({
    messages: [
      { role:"system", content: "" },
      { role:"user", content: "What is the capital of Nigeria?" }
    ],
    model: "openai/gpt-4o-mini",
    temperature: 1,
    max_tokens: 4096,
    top_p: 1
  });

  console.log(response.choices[0].message.content);
}

main().catch((err) => {
  console.error("The sample encountered an error:", err);
});
