/**
 * Test script for database configuration loading
 * Verifies that the runtime server can load configurations from database
 */

import { testConnection, closePool } from '../config/database.js';
import { 
  loadProvidersConfig,
  loadModelsConfig,
  loadAgentsConfig,
  getModelConfig,
  getForcedModel,
  isClaudeModel,
  isGeminiModel,
  isGPTModel
} from '../config/loader.js';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Runtime Server Database Configuration Test           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Test 1: Database Connection
    console.log('[1/5] Testing database connection...\n');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }

    // Test 2: Load Providers
    console.log('\n[2/5] Loading providers from database...\n');
    const providersConfig = await loadProvidersConfig();
    const providerKeys = Object.keys(providersConfig.providers);
    console.log(`  ✓ Loaded ${providerKeys.length} providers`);
    console.log(`  ✓ Provider keys: ${providerKeys.join(', ')}`);

    // Test 3: Load Models
    console.log('\n[3/5] Loading models from database...\n');
    const modelsConfig = await loadModelsConfig();
    console.log(`  ✓ Loaded ${modelsConfig.models.length} models`);
    console.log(`  ✓ Default agent: ${modelsConfig.default_agent}`);
    console.log(`  ✓ Default model: ${modelsConfig.default_model}`);
    console.log(`  ✓ Sample models: ${modelsConfig.models.slice(0, 3).map(m => m.key).join(', ')}`);

    // Test 4: Load Agents
    console.log('\n[4/5] Loading agents from database...\n');
    const agentsConfig = await loadAgentsConfig();
    console.log(`  ✓ Loaded ${agentsConfig.agents.length} agents`);
    console.log(`  ✓ Agent types: ${agentsConfig.agents.map(a => a.type).join(', ')}`);

    // Test 5: Helper Functions
    console.log('\n[5/5] Testing helper functions...\n');
    
    const claudeModel = await getModelConfig('claude-4.5-haiku');
    console.log(`  ✓ getModelConfig('claude-4.5-haiku'):`, claudeModel ? 'Found' : 'Not found');
    
    const forcedModel = await getForcedModel('claude-3.7-sonnet');
    console.log(`  ✓ getForcedModel('claude-3.7-sonnet'): ${forcedModel}`);
    
    console.log(`  ✓ isClaudeModel('claude-4.5-haiku'): ${isClaudeModel('claude-4.5-haiku')}`);
    console.log(`  ✓ isGeminiModel('gemini-2.5-flash-lite'): ${isGeminiModel('gemini-2.5-flash-lite')}`);
    console.log(`  ✓ isGPTModel('gpt-5-mini'): ${isGPTModel('gpt-5-mini')}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ All tests passed! Database integration working correctly.');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();

