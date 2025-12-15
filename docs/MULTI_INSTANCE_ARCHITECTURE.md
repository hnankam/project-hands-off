# Multi-Instance Named Plans & Graphs Architecture

## Overview

This document describes the architecture for supporting multiple named plans and graphs within a single session, where each instance can be active simultaneously and referenced by human-readable names.

## Core Design Principles

### 1. **Flat Structure**
- `plans` and `graphs` are dictionaries at the root of `AgentState`
- No intermediate wrapper layers
- Direct access: `state.plans[plan_id]` instead of `state.plan.plans[plan_id]`

### 2. **Multi-Active Status-Based**
- Multiple plans and graphs can be `active` simultaneously
- No "active pointer" needed (`active_plan_id`, `active_graph_id`)
- Status is intrinsic to each instance: `active`, `paused`, `completed`, `cancelled`, `waiting`

### 3. **Self-Contained Instances**
- Each `PlanInstance` and `GraphInstance` contains all its data
- No shared metadata collections
- Metadata (e.g., `mermaid_diagram`) belongs to specific instance

### 4. **Named References**
- Every plan and graph has a human-readable `name`
- Users can reference by name: `@"Build House Plan"`
- Tools accept name OR ID: `update_plan_step("Build House Plan", ...)`
- Smart resolution: case-insensitive, partial matching

---

## Data Models

### Backend (Python)

```python
class PlanInstance(BaseModel):
    """A single plan instance - fully self-contained"""
    
    # Identity
    plan_id: str                    # Unique ID (e.g., "a1b2c3d4e5f6")
    name: str                       # Human-readable name (e.g., "Build Dream House")
    status: Literal["active", "paused", "completed", "cancelled"] = "active"
    
    # Steps
    steps: list[Step] = Field(default_factory=list)
    
    # Timestamps
    created_at: str                 # ISO 8601 format
    updated_at: str                 # ISO 8601 format
    
    # Custom metadata
    metadata: dict = Field(default_factory=dict)


class GraphInstance(BaseModel):
    """A single graph execution instance - fully self-contained"""
    
    # Identity & Status
    graph_id: str
    name: str
    status: Literal["active", "paused", "completed", "cancelled", "waiting"] = "active"
    
    # Steps
    steps: list[GraphStep] = Field(default_factory=list)
    
    # Core Query State
    query: str = ""
    original_query: str = ""
    result: str = ""
    query_type: str = ""
    
    # Execution Tracking
    execution_history: list[str] = Field(default_factory=list)
    intermediate_results: dict[str, str] = Field(default_factory=dict)
    streaming_text: dict[str, str] = Field(default_factory=dict)
    prompts: dict[str, str] = Field(default_factory=dict)
    tool_calls: dict[str, list[dict]] = Field(default_factory=dict)
    
    # Error Handling
    errors: list[dict[str, str]] = Field(default_factory=list)
    last_error_node: str = ""
    retry_count: int = 0
    max_retries: int = 2
    
    # Control Flow
    iteration_count: int = 0
    max_iterations: int = 5
    should_continue: bool = True
    next_action: str = ""
    planned_steps: list[str] = Field(default_factory=list)
    
    # Visualization (per-instance)
    mermaid_diagram: str = ""
    
    # Human-in-the-Loop (per-instance)
    deferred_tool_requests: Any = None
    
    # Timestamps
    created_at: str
    updated_at: str


class AgentState(BaseModel):
    """Unified agent state with flat structure"""
    
    # Plan instances (keyed by plan_id)
    plans: dict[str, PlanInstance] = Field(default_factory=dict)
    
    # Graph instances (keyed by graph_id)
    graphs: dict[str, GraphInstance] = Field(default_factory=dict)
    
    # Session metadata
    sessionId: str | None = None
    
    # Session-level HITL (optional)
    deferred_tool_requests: Any = None
```

### Frontend (TypeScript)

```typescript
export interface PlanInstance {
  plan_id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  steps: PlanStep[];
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface GraphInstance {
  graph_id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'waiting';
  steps: GraphStep[];
  query: string;
  original_query: string;
  result: string;
  query_type: string;
  execution_history: string[];
  intermediate_results: Record<string, string>;
  streaming_text: Record<string, string>;
  prompts: Record<string, string>;
  tool_calls: Record<string, GraphToolCall[]>;
  errors: Array<{ node?: string; error?: string; timestamp?: string }>;
  last_error_node: string;
  retry_count: number;
  max_retries: number;
  iteration_count: number;
  max_iterations: number;
  should_continue: boolean;
  next_action: string;
  planned_steps: string[];
  mermaid_diagram: string;
  deferred_tool_requests?: unknown;
  created_at: string;
  updated_at: string;
}

export interface UnifiedAgentState {
  plans?: Record<string, PlanInstance>;
  graphs?: Record<string, GraphInstance>;
  sessionId?: string;
  deferred_tool_requests?: unknown;
}
```

---

## Tool API

### Plan Tools

#### `create_plan(name, steps, status="active")`
Creates a new plan with a descriptive name.

**Parameters:**
- `name` (str, required): Human-readable name (e.g., "Build Dream House")
- `steps` (list[str], required): List of step descriptions
- `status` (str, optional): Initial status, default "active"

**Returns:**
- Confirmation message with plan name and ID
- Activity message for UI rendering

**Example:**
```python
create_plan(
    name="Research Machine Learning",
    steps=["Read papers", "Summarize findings", "Draft report"]
)
```

#### `update_plan_step(plan_identifier, step_index, description?, status?)`
Updates a specific plan's step.

**Parameters:**
- `plan_identifier` (str, required): Plan name OR plan_id
- `step_index` (int, required): Index of step to update
- `description` (str, optional): New description
- `status` (StepStatus, optional): New status

**Example:**
```python
update_plan_step("Build Dream House", 0, status="completed")
# or
update_plan_step("abc123def456", 0, status="completed")
```

#### `update_plan_status(plan_identifier, status)`
Changes a plan's status.

**Parameters:**
- `plan_identifier` (str, required): Plan name OR plan_id
- `status` (str, required): New status ("active", "paused", "completed", "cancelled")

**Example:**
```python
update_plan_status("Build Dream House", "paused")
```

#### `rename_plan(plan_identifier, new_name)`
Renames a plan.

**Parameters:**
- `plan_identifier` (str, required): Current name or ID
- `new_name` (str, required): New human-readable name

**Example:**
```python
rename_plan("Build House", "Build Eco-Friendly House")
```

#### `list_plans()`
Lists all plans with their names, IDs, and status.

**Returns:**
- Formatted string with plan details

**Example Output:**
```
📋 Plans in this session:

🟢 **Build Dream House**
   ID: a1b2c3d4e5f6
   Status: active
   Progress: 2/5 steps
   Created: 2025-12-15T10:00:00Z

⏸️ **Learn Python**
   ID: f6e5d4c3b2a1
   Status: paused
   Progress: 0/3 steps
   Created: 2025-12-15T10:15:00Z
```

#### `delete_plan(plan_identifier)`
Removes a plan from the session.

**Parameters:**
- `plan_identifier` (str, required): Plan name OR plan_id

### Graph Tools

Similar structure to plan tools:
- `create_graph(name, query, ...)`
- `update_graph_status(graph_identifier, status)`
- `list_graphs()`
- `delete_graph(graph_identifier)`

---

## Name Resolution Algorithm

### `resolve_plan_identifier(state, identifier) -> plan_id | None`

Resolution order:
1. **Exact plan_id match**: `"abc123def456"`
2. **Exact name match** (case-sensitive): `"Build Dream House"`
3. **Case-insensitive name match**: `"build dream house"`
4. **Partial name match** (starts with): `"Build Dream"` matches `"Build Dream House"`
5. **Return None** if no match found

**Error Handling:**
- If no match, raise `ValueError` with list of available plans/graphs
- Include both names and IDs in error message

---

## Access Patterns

### Backend

```python
# Direct access
plan = ctx.deps.state.plans[plan_id]
graph = ctx.deps.state.graphs[graph_id]

# Filter by status
active_plans = [p for p in ctx.deps.state.plans.values() if p.status == "active"]
completed_graphs = [g for g in ctx.deps.state.graphs.values() if g.status == "completed"]

# Update instance
ctx.deps.state.plans[plan_id].steps[0].status = StepStatus.COMPLETED
ctx.deps.state.plans[plan_id].updated_at = datetime.now().isoformat()

# Name resolution
plan_id = resolve_plan_identifier(ctx.deps.state, "Build House Plan")
```

### Frontend

```typescript
// Direct access
const plan = state.plans?.[planId];
const graph = state.graphs?.[graphId];

// Get all instances
const allPlans = Object.values(state.plans || {});
const allGraphs = Object.values(state.graphs || {});

// Filter by status
const activePlans = Object.values(state.plans || {})
  .filter(p => p.status === 'active');

// Sort by updated time
const recentPlans = Object.values(state.plans || {})
  .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
```

---

## Activity Messages & Rendering

### Message Targeting

Each plan/graph instance gets its own activity card:
- Plan: `messageId = f"plan-{plan_id}"`
- Graph: `messageId = f"graph-{graph_id}"`

CopilotKit automatically manages multiple activity cards.

### Rendering Strategy

**Active Instances** → Full cards with all details
**Paused Instances** → Collapsed cards in expandable section
**Completed Instances** → Minimal summary or hidden

**Layout Options:**
- **1-2 active**: Stack vertically (full width)
- **3-4 active**: Grid layout (2 columns)
- **5+ active**: Accordion or tabs

---

## UI Components

### TaskProgressCard
Displays a single plan instance.

**Props:**
- `planId`: string
- `planName`: string (displayed prominently)
- `steps`: PlanStep[]
- `status`: Status enum
- `badge`: Optional badge text (e.g., "🟢 Active")

**Features:**
- Show plan name as title
- Display truncated ID
- Status badge
- Progress indicator
- Step list
- Action buttons (pause, complete, delete)

### GraphStateCard
Displays a single graph instance.

**Props:**
- `graphId`: string
- `graphName`: string
- `graph`: GraphInstance
- `badge`: Optional badge text

**Features:**
- Show graph name as title
- Query and result display
- Execution history
- Mermaid diagram visualization
- Step-by-step progress
- HITL support for waiting status

### @Mention Support

**Input Autocomplete:**
- Detect `@` trigger in textarea
- Show dropdown with plan/graph names
- Filter as user types
- Insert `@"Plan Name"` on selection

**Mention Extraction:**
- Parse `@"Plan Name"` or `@Plan_Name` from user input
- Resolve to actual plan/graph instance
- Highlight mentions in UI

---

## Agent Instructions

### Dynamic Context Injection

The agent should receive comprehensive instructions about the multi-instance system. This should be injected dynamically via `@agent.instructions` to include current state.

#### Complete Implementation

```python
# copilotkit-pydantic/core/agent_factory.py

from core.models import UnifiedDeps, StepStatus
from pydantic_ai import RunContext

@agent.instructions
def inject_multi_instance_context(ctx: RunContext[UnifiedDeps]) -> str:
    """Generate dynamic context about current plans and graphs.
    
    This provides the agent with:
    - Current active/paused plans and graphs
    - Usage examples with names
    - Best practices for multi-instance management
    """
    
    # Extract current state
    active_plans = [p for p in ctx.deps.state.plans.values() if p.status == "active"]
    paused_plans = [p for p in ctx.deps.state.plans.values() if p.status == "paused"]
    active_graphs = [g for g in ctx.deps.state.graphs.values() if g.status == "active"]
    
    # Build context string
    context = """
# Multi-Instance Workflow System

You can manage multiple plans and graphs simultaneously. Each has:
- **Unique ID**: Auto-generated (e.g., "abc123def456")
- **Human Name**: Descriptive, user-friendly (e.g., "Build Dream House")
- **Status**: active, paused, completed, cancelled

## 🎯 Targeting Plans & Graphs

You can reference by **NAME** or **ID**:
- ✅ `update_plan_step("Build House Plan", 0, status="completed")`
- ✅ `update_plan_step("abc123def456", 0, status="completed")`

Names are:
- Case-insensitive ("build house" matches "Build House")
- Support partial matching ("Build" matches "Build House Plan")
- Natural and user-friendly

## 📋 User @Mentions

When users mention plans/graphs using @name syntax:
- `@"Build House Plan"` or `@Build House Plan`
- Extract the name and use it directly in tool calls
- Example: User says "Update @Build House Plan" → you call `update_plan_step("Build House Plan", ...)`

"""
    
    # Add current active plans
    if active_plans:
        context += f"\n## 🟢 Currently Active Plans ({len(active_plans)}):\n\n"
        for plan in active_plans:
            completed = sum(1 for s in plan.steps if s.status == StepStatus.COMPLETED)
            total = len(plan.steps)
            context += f'**"{plan.name}"** (ID: `{plan.plan_id}`)\n'
            context += f'  - Progress: {completed}/{total} steps completed\n'
            context += f'  - Created: {plan.created_at}\n\n'
    
    # Add paused plans
    if paused_plans:
        context += f"\n## ⏸️ Paused Plans ({len(paused_plans)}):\n\n"
        for plan in paused_plans:
            context += f'**"{plan.name}"** (ID: `{plan.plan_id}`)\n'
            context += f'  - Steps: {len(plan.steps)}\n\n'
        context += "💡 **Tip**: Use `update_plan_status(name, 'active')` to resume a paused plan\n\n"
    
    # Add active graphs
    if active_graphs:
        context += f"\n## 🔄 Active Graph Executions ({len(active_graphs)}):\n\n"
        for graph in active_graphs:
            context += f'**"{graph.name}"** (ID: `{graph.graph_id}`)\n'
            context += f'  - Query: {graph.query[:60]}{"..." if len(graph.query) > 60 else ""}\n'
            context += f'  - Status: {graph.status}\n\n'
    
    # Add instructions if no active work
    if not active_plans and not paused_plans and not active_graphs:
        context += "\n## 💤 No Active Work\n\n"
        context += "Currently, there are no active plans or graphs.\n"
        context += "Create a new plan with `create_plan(name=..., steps=[...])`\n\n"
    
    # Add best practices
    context += """
## ✨ Best Practices

### 1. **Use Descriptive Names**
When creating plans/graphs, choose names that clearly describe the goal:
- ✅ "Research Machine Learning Papers"
- ✅ "Design Database Schema for E-commerce"
- ✅ "Learn Python Programming"
- ❌ "Plan 1", "Task", "TODO"

### 2. **Reference by Name for User-Friendliness**
When the user mentions a plan by name:
- User: "Update @Build House Plan"
- You: `update_plan_step("Build House Plan", 0, status="completed")`

When working programmatically, you can use IDs:
- `update_plan_step("abc123def456", 0, status="completed")`

### 3. **Use list_plans() When Unsure**
If you're not sure which plan to update or what plans exist:
```python
list_plans()
```
This returns a formatted list with names, IDs, status, and progress.

### 4. **Manage Multiple Parallel Tasks**
You can work on multiple plans simultaneously:
```python
# Start two independent research streams
create_plan(
    name="Research Deep Learning",
    steps=["Read papers", "Summarize", "Draft report"]
)

create_plan(
    name="Research NLP",
    steps=["Survey papers", "Compare models", "Write summary"]
)

# Work on both
update_plan_step("Research Deep Learning", 0, status="completed")
update_plan_step("Research NLP", 0, status="running")
```

### 5. **Use Status for Workflow Control**
Pause plans when switching focus, resume when ready:
```python
# Pause one plan
update_plan_status("Research Deep Learning", "paused")

# Resume later
update_plan_status("Research Deep Learning", "active")

# Mark complete when done
update_plan_status("Research Deep Learning", "completed")
```

### 6. **Auto-generate Names from Context**
If the user doesn't provide a name, create one from the task:
- User: "Create a plan to learn Python"
- You: `create_plan(name="Learn Python", steps=[...])`

## 🛠️ Available Tools

### Plan Management:
- `create_plan(name, steps, status="active")` - Create a new named plan
- `update_plan_step(plan_identifier, step_index, description?, status?)` - Update a step
- `update_plan_status(plan_identifier, status)` - Change plan status
- `rename_plan(plan_identifier, new_name)` - Rename a plan
- `list_plans()` - Show all plans with details
- `delete_plan(plan_identifier)` - Remove a plan

### Graph Execution:
- `run_graph(query, max_iterations=5)` - Execute multi-agent graph
- (Additional graph tools similar to plan tools)

## 💡 Example Workflows

### Creating Multiple Plans:
```python
# User: "Help me build a house and learn Python"

create_plan(
    name="Build Dream House",
    steps=[
        "Research architects",
        "Get construction permits",
        "Hire contractors",
        "Foundation work",
        "Framing and structure",
        "Utilities installation",
        "Interior finishing",
        "Final inspection"
    ]
)

create_plan(
    name="Learn Python Programming",
    steps=[
        "Complete Python basics course",
        "Build 3 small projects",
        "Learn Django framework",
        "Build full-stack app"
    ]
)

# Result: Two active plans, user can work on both
```

### Updating by Name:
```python
# User: "Mark the first step of building the house as done"

update_plan_step("Build Dream House", 0, status="completed")

# Result: Step 0 in "Build Dream House" marked as completed
```

### Managing Work:
```python
# User: "Pause the house project, focus on Python"

update_plan_status("Build Dream House", "paused")

# Later: "Resume the house project"
update_plan_status("Build Dream House", "active")
```

### Renaming:
```python
# User: "Rename the house project to 'Build Eco-Friendly House'"

rename_plan("Build Dream House", "Build Eco-Friendly House")
```

## 🎯 Key Principles

1. **Always use descriptive names** - Help users remember what each plan is for
2. **Support @mentions** - When user says @PlanName, use that name
3. **Be explicit with targeting** - Always specify which plan/graph you're operating on
4. **Use list_plans() liberally** - Show status before making changes
5. **Multiple active = normal** - Don't try to enforce single active plan
6. **Status transitions are cheap** - Pause/resume as workflow demands

## ⚠️ Common Mistakes to Avoid

❌ Don't create plans with generic names like "Plan 1"
❌ Don't assume only one plan can be active
❌ Don't forget to specify plan_identifier in updates
❌ Don't try to update non-existent plans without checking first

✅ Do use descriptive names
✅ Do embrace multiple active plans
✅ Do use list_plans() to show current state
✅ Do handle plan_not_found errors gracefully
"""
    
    return context
```

### Key Points Explained

#### 1. **Dynamic State Awareness**
The instructions include current active/paused plans and graphs, so the agent knows exactly what's in progress.

#### 2. **Name-First Approach**
Emphasizes using human-readable names for all interactions, making the system more intuitive.

#### 3. **@Mention Support**
Explicitly tells the agent how to handle user @mentions of plan/graph names.

#### 4. **Comprehensive Examples**
Provides real-world examples of:
- Creating multiple plans
- Updating by name
- Managing workflow with status changes
- Renaming plans

#### 5. **Best Practices & Pitfalls**
Clear guidance on what to do (✅) and what to avoid (❌).

#### 6. **Tool Reference**
Quick reference to all available tools with signatures.

### Implementation Location

This should be added to `copilotkit-pydantic/core/agent_factory.py` as part of the agent creation process:

```python
# In create_agent() function
agent = Agent(
    model=model,
    deps_type=UnifiedDeps,
    result_type=str,
)

# Add the instructions
agent.instructions(inject_multi_instance_context)
```

---

## State Synchronization

### Backend → Frontend Flow

1. Tool executes (e.g., `create_plan`)
2. Update `ctx.deps.state.plans[plan_id]`
3. Send `StateSnapshotEvent` with full state
4. Send `ActivitySnapshotEvent` for specific plan/graph
5. Frontend receives events
6. Update `UnifiedAgentState`
7. Render/update activity cards

### Graph State Sync

```python
def sync_to_shared_state(state: QueryState, shared_state: AgentState, graph_id: str):
    """Sync internal QueryState to AgentState.graphs[graph_id]"""
    # Create or update GraphInstance
    # Sync all fields
    # Update timestamps
    # Update status based on state
```

---

## Migration Strategy

### Phase 1: Backend Foundation
1. Update `core/models.py` with new flat structure
2. Add `name` field to `PlanInstance` and `GraphInstance`
3. Update all tools in `backend_tools.py`
4. Add name resolution functions
5. Add new tools (`rename_plan`, `list_plans`, etc.)

### Phase 2: Backend Graph Integration
6. Update `multi_agent_graph/state.py` for flat structure
7. Update `sync_to_shared_state` to use `graphs` dict
8. Add graph name handling
9. Update graph runner to accept `name` parameter

### Phase 3: Frontend Types
10. Update `components/graph-state/types.ts`
11. Add `name` field to interfaces
12. Update utility functions

### Phase 4: Frontend Components
13. Update `activityRenderers.tsx` for multi-instance rendering
14. Update `TaskProgressCard` to display names
15. Update `GraphStateCard` to display names
16. Add collapsible sections for paused/completed

### Phase 5: Frontend Hooks
17. Update `useAgentStateManagement.ts`
18. Update `useSessionData.ts`
19. Update state initialization and loading

### Phase 6: Storage & Migration
20. Update `session-schema.ts` with flat structure
21. Update `session-storage-db.ts` methods
22. Write migration script for existing data
23. Test migration with various scenarios

### Phase 7: Polish
24. Add @mention autocomplete to input
25. Add name validation
26. Update documentation
27. Add examples and tests

---

## Example Interactions

### Creating Multiple Plans

**User:** "Create a plan to build a house and another to learn Python"

**Agent:**
```python
create_plan(
    name="Build a House",
    steps=["Design blueprints", "Get permits", "Hire contractors", "Foundation", "Framing"]
)

create_plan(
    name="Learn Python",
    steps=["Complete basics course", "Build 3 projects", "Learn Django"]
)
```

**UI:** Shows 2 active plan cards side-by-side

### Updating by Name

**User:** "Mark the first step of @Build a House as completed"

**Agent:**
```python
update_plan_step("Build a House", 0, status="completed")
```

**UI:** Plan card updates, step 1 shows checkmark

### Pausing and Resuming

**User:** "Pause @Learn Python for now"

**Agent:**
```python
update_plan_status("Learn Python", "paused")
```

**UI:** Card moves to "Paused Plans" section

**User:** "Resume @Learn Python"

**Agent:**
```python
update_plan_status("Learn Python", "active")
```

**UI:** Card moves back to active section

---

## Testing Checklist

### Backend
- [ ] Create plan with name
- [ ] Update plan by name
- [ ] Update plan by ID
- [ ] Resolve case-insensitive name
- [ ] Resolve partial name match
- [ ] Handle name not found
- [ ] Multiple active plans coexist
- [ ] Status transitions work
- [ ] Rename plan
- [ ] Delete plan
- [ ] List plans shows all details
- [ ] Same logic for graphs

### Frontend
- [ ] Display plan names prominently
- [ ] Show multiple active cards
- [ ] Collapse paused plans
- [ ] Status badges show correctly
- [ ] @mention autocomplete works
- [ ] @mention extraction works
- [ ] State persistence across reloads
- [ ] Migration from old format works

### Integration
- [ ] Activity messages route to correct cards
- [ ] State sync backend → frontend
- [ ] Multiple plans update independently
- [ ] UI performance with 10+ plans
- [ ] Deep link to specific plan/graph

---

## Performance Considerations

### Backend
- Name resolution is O(n) but acceptable for typical use (< 100 plans)
- Consider indexing by name if performance issues arise
- Lazy-load completed plans/graphs if count grows large

### Frontend
- Render only active instances at full fidelity
- Virtualize list if > 20 instances
- Lazy-render completed section
- Debounce @mention autocomplete search

### Storage
- Monitor IndexedDB size with many instances
- Implement auto-cleanup for old completed instances
- Consider archiving to separate table after N days

---

## Security Considerations

- **Name Injection**: Sanitize user-provided names
- **XSS**: Escape names in UI rendering
- **Storage Limits**: Enforce max plans/graphs per session
- **Name Length**: Limit to 100 characters

---

## Future Enhancements

1. **Tags/Labels**: Add tags to plans for filtering
2. **Plan Templates**: Save and reuse plan structures
3. **Dependencies**: Link plans/graphs (e.g., "blocked by")
4. **Sharing**: Share plan structure with other users
5. **Analytics**: Track completion rates, time estimates
6. **Notifications**: Alert when plan status changes
7. **Batch Operations**: Update multiple plans at once
8. **Search**: Full-text search across plan names and steps

---

## Glossary

- **PlanInstance**: A single plan with its own ID, name, steps, and status
- **GraphInstance**: A single graph execution with its own ID, name, and state
- **Multi-Active**: Multiple instances can be "active" simultaneously
- **Name Resolution**: Process of converting a human name to an ID
- **@Mention**: UI feature for referencing plans/graphs by name
- **Flat Structure**: Direct dictionary at root level (no nesting)
- **Self-Contained**: Instance has all its data internally
- **Status-Based**: Status is intrinsic property, not external flag

---

**Version:** 1.0  
**Last Updated:** 2025-12-15  
**Author:** AI Assistant

