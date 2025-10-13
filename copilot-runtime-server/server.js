import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { CopilotRuntime, GoogleGenerativeAIAdapter, copilotRuntimeNodeExpressEndpoint} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";

// Load environment variables from .env file
config(); 

const app = express();
const port = 3001; // Different port from your ADK agent (8000)

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Enable CORS for the Chrome extension
app.use(cors({
  origin: ['chrome-extension://*', 'http://localhost:*'],
  credentials: true
}));

app.use(express.json());

// Use Google Generative AI adapter for non-agent components like useCopilotChatSuggestions
const serviceAdapter = new GoogleGenerativeAIAdapter({
  model: "gemini-2.5-flash-lite",
  apiKey: process.env.GOOGLE_API_KEY,
});

// Function to create a dynamic agent URL based on agent type and model
function getDynamicAgentUrl(agent, model) {
  // Map model names to their endpoint paths
  const modelEndpoints = {
    'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
    'gemini-2.5-flash': 'gemini-2.5-flash',
    'gemini-2.5-pro': 'gemini-2.5-pro',
    'claude-3.5-sonnet': 'claude-3.5-sonnet',
    'claude-3.7-sonnet': 'claude-3.7-sonnet',
    'claude-4.1-opus': 'claude-4.1-opus',
    'claude-4.5-sonnet': 'claude-4.5-sonnet',
  };
  
  const endpoint = modelEndpoints[model] || 'gemini-2.5-flash-lite';
  // Include agent type in the URL path: /agent/{agent_type}/{model}
  return `http://localhost:8001/agent/${agent}/${endpoint}`;
}

// No need for multiple dynamic agents - we use a single dynamic_agent that routes based on headers

const runtime = new CopilotRuntime({
    agents: {
      // Dynamic agent that routes based on headers (agent type + model)
      "dynamic_agent": new HttpAgent({ 
        url: "http://localhost:8001/agent/general/gemini-2.5-flash-lite",
        headers: {
          'x-copilot-agent-type': 'general',
          'x-copilot-model-type': 'gemini-2.5-flash-lite'
        }
      }),
    },
  });

// Set up the CopilotKit endpoint
const copilotKitEndpoint = copilotRuntimeNodeExpressEndpoint({
  endpoint: '/api/copilotkit',
  serviceAdapter: serviceAdapter,
  runtime,
});

// Middleware to log and route dynamic_agent requests based on headers
app.use('/api/copilotkit', (req, res, next) => {
  const agent = req.headers['x-copilot-agent-type'] || req.query.agent || 'general';
  const model = req.headers['x-copilot-model-type'] || req.query.model || 'gemini-2.5-flash-lite';
  
  console.log('=== CopilotKit Request ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Agent:', agent);
  console.log('Model:', model);
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify({
    'x-copilot-agent-type': req.headers['x-copilot-agent-type'],
    'x-copilot-model-type': req.headers['x-copilot-model-type']
  }));
  
  // Log the body for POST requests (but limit size)
  if (req.method === 'POST' && req.body) {
    const bodyStr = JSON.stringify(req.body);
    console.log('Body preview:', bodyStr.substring(0, 200) + (bodyStr.length > 200 ? '...' : ''));
  }
  
  console.log('=========================');
  
  // Always update dynamic_agent to use the correct model and agent from headers
  console.log(`🔄 Dynamic routing: Updating dynamic_agent to ${model} with agent=${agent}`);
  console.log(`   Target URL: ${getDynamicAgentUrl(agent, model)}`);
  console.log(`   Headers to forward: x-copilot-agent-type=${agent}, x-copilot-model-type=${model}`);
  
  // Recreate the HttpAgent with the new URL (agent + model in path) and headers
  runtime.agents['dynamic_agent'] = new HttpAgent({ 
    url: getDynamicAgentUrl(agent, model),
    headers: {
      'x-copilot-agent-type': agent,
      'x-copilot-model-type': model,
      'Content-Type': 'application/json'
    }
  });
  
  console.log('✅ HttpAgent updated successfully');
  
  next();
});

// Mount the CopilotKit endpoint
app.use('/api/copilotkit', copilotKitEndpoint);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'CopilotKit Runtime Server is running' });
});

// Global error handler for better debugging
app.use((err, req, res, next) => {
  console.error('=== Global Error Handler ===');
  console.error('Error:', err);
  console.error('Stack:', err.stack);
  console.error('Message:', err.message);
  console.error('===========================');
  next(err);
});

app.listen(port, () => {
  console.log(`CopilotKit Runtime Server running on http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`CopilotKit endpoint: http://localhost:${port}/api/copilotkit`);
  console.log(`Configured to forward requests to ADK agent on port 8000`);
  
  // Log registered agents
  console.log('\n📋 Registered Agents:');
  Object.keys(runtime.agents).forEach(agentName => {
    console.log(`  - ${agentName}`);
  });
  console.log('');
  
  // Check if GOOGLE_API_KEY is set
  if (!process.env.GOOGLE_API_KEY) {
    console.warn('⚠️  Warning: GOOGLE_API_KEY environment variable not set!');
    console.warn('   Please add it to the .env file in the copilot-runtime-server directory');
    console.warn('   Get a key from: https://makersuite.google.com/app/apikey\n');
  } else {
    console.log('✅ GOOGLE_API_KEY is configured');
  }

    // Check if AWS_ACCESS_KEY_ID is set
    if (!process.env.AWS_ACCESS_KEY_ID) {
      console.warn('⚠️  Warning: AWS_ACCESS_KEY_ID environment variable not set!');
      console.warn('   Please add it to the .env file in the copilot-runtime-server directory');
      console.warn('   Get a key from: https://aws.amazon.com/console/\n');
    } else {
      console.log('✅ AWS_ACCESS_KEY_ID is configured');
    }
});
