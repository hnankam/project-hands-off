# Configuration API Endpoints

These endpoints provide agent and model configuration data formatted for the Chrome extension's side panel selectors.

## Endpoints

### GET `/api/config/agents`
Returns available agents formatted for `AgentSelector` component.

**Response Format:**
```json
{
  "agents": [
    {
      "id": "general",
      "label": "General Agent",
      "description": "General purpose agent for common tasks"
    },
    {
      "id": "wiki",
      "label": "Wiki Agent",
      "description": "Specialized agent for Wikipedia queries"
    }
  ],
  "count": 2
}
```

**Usage in UI:**
```typescript
const response = await fetch('http://localhost:3001/api/config/agents');
const { agents } = await response.json();
// agents can be used directly in AgentSelector (add icons client-side)
```

---

### GET `/api/config/models`
Returns available models formatted for `ModelSelector` component.

**Response Format:**
```json
{
  "models": [
    {
      "id": "claude-4.5-haiku",
      "label": "Claude 4.5 Haiku",
      "provider": "Anthropic"
    },
    {
      "id": "gemini-2.5-flash",
      "label": "Gemini 2.5 Flash",
      "provider": "Google"
    }
  ],
  "default_model": "claude-4.5-haiku",
  "count": 2
}
```

**Usage in UI:**
```typescript
const response = await fetch('http://localhost:3001/api/config/models');
const { models, default_model } = await response.json();
// models can be used directly in ModelSelector
```

---

### GET `/api/config/defaults`
Returns default agent and model selections.

**Response Format:**
```json
{
  "default_agent": "general",
  "default_model": "claude-4.5-haiku"
}
```

**Usage in UI:**
```typescript
const response = await fetch('http://localhost:3001/api/config/defaults');
const { default_agent, default_model } = await response.json();
// Use these to initialize the selectors
```

---

### GET `/api/config`
Returns complete configuration (all of the above in one call).

**Response Format:**
```json
{
  "agents": [
    { "id": "general", "label": "General Agent", "description": "..." }
  ],
  "models": [
    { "id": "claude-4.5-haiku", "label": "Claude 4.5 Haiku", "provider": "Anthropic" }
  ],
  "defaults": {
    "agent": "general",
    "model": "claude-4.5-haiku"
  }
}
```

**Usage in UI (recommended):**
```typescript
const response = await fetch('http://localhost:3001/api/config');
const { agents, models, defaults } = await response.json();
// Initialize both selectors with a single API call
```

---

## Data Mapping

### Database → API Response

**Agents:**
- `agent_type` → `id`
- `agent_name` → `label`
- `description` → `description`

**Models:**
- `model_key` → `id`
- `display_name` or `model_name` → `label`
- `provider_key` → `provider` (mapped to display name)

**Provider Display Names:**
- `anthropic` → "Anthropic"
- `anthropic_bedrock` → "Anthropic"
- `google` → "Google"
- `azure_openai` → "OpenAI"
- `openai` → "OpenAI"

---

## UI Component Integration

### Updating AgentSelector to use API

```typescript
// Replace hardcoded agents array with:
const [agents, setAgents] = useState<Agent[]>([]);

useEffect(() => {
  fetch('http://localhost:3001/api/config/agents')
    .then(res => res.json())
    .then(data => {
      // Add icons to the data
      const agentsWithIcons = data.agents.map(agent => ({
        ...agent,
        icon: getIconForAgent(agent.id) // Define icon mapping function
      }));
      setAgents(agentsWithIcons);
    });
}, []);
```

### Updating ModelSelector to use API

```typescript
// Replace hardcoded models array with:
const [models, setModels] = useState<Model[]>([]);

useEffect(() => {
  fetch('http://localhost:3001/api/config/models')
    .then(res => res.json())
    .then(data => {
      setModels(data.models);
      // Optionally set default model
      if (data.default_model) {
        onModelChange(data.default_model);
      }
    });
}, []);
```

---

## Notes

- All endpoints only return **enabled** agents and models (where `enabled = true` in database)
- Provider names are normalized to display-friendly format (e.g., "Anthropic", "Google", "OpenAI")
- Icons are not included in API responses (add them client-side based on agent ID)
- Responses are cached server-side for performance
- All endpoints use consistent error handling via global error middleware

