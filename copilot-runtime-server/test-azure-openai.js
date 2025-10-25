/**
 * Test file for Azure OpenAI integration
 * Run with: node test-azure-openai.js
 */

import { AzureOpenAI } from "openai";
import dotenv from "dotenv";
import { OPENAI_API_KEY } from './config/index.js';

dotenv.config();

export async function main() {
  // You will need to set these environment variables or edit the following values
  const endpoint = "https://dgp-dev-openai.openai.azure.com/";
  const apiKey = OPENAI_API_KEY;
  const apiVersion = "2025-01-01-preview";
  const deployment = "gpt-5-mini"; // This must match your deployment name

  console.log("🔧 Azure OpenAI Configuration:");
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   API Version: ${apiVersion}`);
  console.log(`   Deployment: ${deployment}`);
  console.log(`   API Key: ${apiKey ? '***' + apiKey.slice(-4) : 'NOT SET'}`);
  console.log();

  const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });

  console.log("📤 Sending request to Azure OpenAI...");
  
  const result = await client.chat.completions.create({
    messages: [
      { role: "developer", content: "You are an AI assistant that helps people find information." },
      { role: "user", content: "hey" },
      { role: "assistant", content: "Hey! How can I help you today?" }
    ],
    max_completion_tokens: 16384
  });

  console.log("✅ Response received!");
  console.log();
  console.log("📄 Result:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("❌ The sample encountered an error:", err);
  console.error();
  console.error("💡 Make sure you have set the following environment variables:");
  console.error("   AZURE_OPENAI_ENDPOINT");
  console.error("   AZURE_OPENAI_API_KEY");
  console.error();
  console.error("Or update the values directly in this file.");
  process.exit(1);
});

