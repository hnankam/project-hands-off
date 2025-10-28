# Quick Setup Guide

## Configuration Files Setup

The copilot-runtime-server now uses JSON configuration files instead of hardcoded values.

### 1. Copy Example Files

```bash
cd config
cp providers.json.example providers.json
cp models.json.example models.json
cp agents.json.example agents.json
```

### 2. Environment Variables

Keep your `.env` file with credentials:

```bash
# Google AI
GOOGLE_API_KEY=your-google-api-key

# AWS Bedrock (for Anthropic models)
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=us-east-1

# Azure OpenAI
AZURE_OPENAI_API_KEY=your-azure-api-key
AZURE_OPENAI_ENDPOINT=https://your-instance.openai.azure.com
AZURE_OPENAI_BASE_URL=https://your-instance.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-04-01-preview

# Server Configuration
PORT=3001
AGENT_BASE_URL=http://localhost:8001
NODE_ENV=development
DEBUG=false

# CORS (comma-separated origins)
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

### 3. Start Server

```bash
npm start
```

Or in development mode with auto-reload:

```bash
npm run dev
```

### 4. Verify Setup

Test configuration loading:

```bash
node -e "
import('./config/loader.js').then(loader => {
  const models = loader.loadModelsConfig();
  console.log('✓ Loaded', models.models.length, 'models');
  console.log('✓ Default model:', models.default_model);
});
"
```

Test server health:

```bash
curl http://localhost:3001/health
```

## What's Configured

### Providers (config/providers.json)

- **Google Generative AI** - For Gemini models
- **Anthropic Bedrock** - For Claude models
- **Azure OpenAI** - For GPT models

### Models (config/models.json)

- **11 models** configured
- **Default model**: `gemini-2.5-flash-lite`
- **Cost optimization** via `forced_model` (transparent to client)

### Agents (config/agents.json)

- **general** - General purpose agent
- **databricks** - Databricks operations agent
- **excel** - Excel operations agent

## Cost Optimization

Models can be "forced" to cost-effective alternatives:

```json
{
  "key": "claude-3.7-sonnet",
  "forced_model": "claude-4.5-haiku"
}
```

When client requests `claude-3.7-sonnet`, they transparently get `claude-4.5-haiku` (significant cost savings).

## Customization

### Add a New Model

Edit `config/models.json`:

```json
{
  "key": "new-model",
  "name": "New Model Name",
  "provider": "google",
  "model_id": "gemini-model-id",
  "endpoint": "new-model",
  "enabled": true,
  "forced_model": "cost-effective-alternative",
  "description": "Description"
}
```

### Add a New Provider

Edit `config/providers.json`:

```json
{
  "new_provider": {
    "type": "provider_type",
    "name": "Provider Name",
    "enabled": true,
    "credentials": {
      "api_key": null
    },
    "default_settings": {
      "prompt_caching": {
        "enabled": true,
        "debug": false
      }
    }
  }
}
```

### Enable/Disable Models or Agents

Set `"enabled": false` in the configuration file.

## Troubleshooting

### Configuration Not Loading

**Error**: `Cannot find module './providers.json'`

**Solution**: Copy example files (see step 1)

### Invalid JSON

**Error**: `Unexpected token in JSON`

**Solution**: Validate JSON:

```bash
node -c config/providers.json
node -c config/models.json
node -c config/agents.json
```

### Port Already in Use

**Error**: `EADDRINUSE: address already in use`

**Solution**: Change port or stop other server:

```bash
PORT=3002 npm start
```

## Next Steps

- Review `CONFIG_REFACTOR.md` for detailed documentation
- Customize models and providers for your needs
- Prepare for database integration (Phase 2)

## Support

For issues or questions:
1. Check `CONFIG_REFACTOR.md` for detailed documentation
2. Verify configuration files are valid JSON
3. Ensure environment variables are set
4. Check server logs for errors

