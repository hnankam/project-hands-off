# Error Handling Guide for Agent Tools

## Critical Rule: Never Raise Exceptions in Tool Functions

**❌ WRONG:**
```python
async def my_tool(ctx: RunContext[UnifiedDeps], param: str) -> str:
    if not param:
        raise ValueError("Parameter is required")  # ❌ Crashes agent!
    return "success"
```

**✅ CORRECT:**
```python
async def my_tool(ctx: RunContext[UnifiedDeps], param: str) -> str:
    if not param:
        return "❌ Error: Parameter is required"  # ✅ Agent handles gracefully
    return "success"
```

---

## Why?

When a tool raises an exception:
1. The agent execution crashes
2. User sees generic error message
3. Conversation state may be lost
4. Debugging is harder

When a tool returns an error string:
1. ✅ Agent continues running
2. ✅ Agent can explain error to user
3. ✅ Agent can try alternative approaches
4. ✅ Conversation continues smoothly

---

## Patterns for Different Return Types

### Tools Returning `str`

```python
async def web_search(ctx: RunContext[UnifiedDeps], prompt: str) -> str:
    if not prompt:
        return "❌ Error: Search prompt cannot be empty"
    
    try:
        result = await perform_search(prompt)
        return result
    except Exception as e:
        logger.exception("Web search failed: %s", e)
        return f"❌ Web search failed: {str(e)}"
```

### Tools Returning `list[str]`

```python
async def generate_images(ctx: RunContext[UnifiedDeps], prompt: str, num: int = 1) -> list[str]:
    if not prompt:
        return ["❌ Error: Image prompt cannot be empty"]
    
    if num < 1 or num > 10:
        return [f"❌ Error: Number of images must be between 1 and 10 (got {num})"]
    
    try:
        urls = await generate(prompt, num)
        return urls
    except Exception as e:
        logger.exception("Image generation failed: %s", e)
        return [f"❌ Image generation failed: {str(e)}"]
```

### Tools Returning `ToolReturn`

```python
async def create_plan(ctx: RunContext[UnifiedDeps], name: str, steps: list[str]) -> ToolReturn:
    # Validation errors
    if not name or not name.strip():
        return ToolReturn(return_value="❌ Error: Plan name cannot be empty")
    
    if not steps:
        return ToolReturn(return_value="❌ Error: Plan must have at least one step")
    
    # Not found errors
    plan_id = resolve_plan_identifier(ctx.deps.state, name)
    if not plan_id:
        available = list_available_plans(ctx.deps.state)
        return ToolReturn(
            return_value=f"❌ Plan '{name}' not found. Available:\n{available}"
        )
    
    try:
        # Success
        return ToolReturn(
            return_value=f"✅ Plan '{name}' created",
            metadata=[...]
        )
    except Exception as e:
        logger.exception("Create plan failed: %s", e)
        return ToolReturn(return_value=f"❌ Failed to create plan: {str(e)}")
```

---

## Error Message Best Practices

### Use Clear Error Prefixes
- ❌ `"Error: Plan not found"` - Generic
- ✅ `"❌ Plan 'Build House' not found"` - Specific with emoji

### Provide Actionable Information
- ❌ `"Invalid input"`
- ✅ `"❌ Plan name cannot be empty. Provide a descriptive name like 'Build House'"`

### List Available Options
```python
if plan_id not in state.plans:
    available = [f'"{p.name}" ({pid})' for pid, p in state.plans.items()]
    return f"❌ Plan '{plan_id}' not found. Available plans:\n" + "\n".join(available)
```

### Include Recovery Suggestions
```python
if not ctx.deps.state.plans:
    return "❌ No plans in this session. Use create_plan(name='...', steps=[...]) to start."
```

---

## Exception Handling Patterns

### Try-Catch for External Calls

```python
async def external_api_tool(ctx: RunContext[UnifiedDeps], query: str) -> str:
    try:
        result = await call_external_api(query)
        return result
    except TimeoutError as e:
        logger.warning("API timeout: %s", e)
        return f"⚠️ API request timed out. Please try again."
    except ConnectionError as e:
        logger.error("API connection failed: %s", e)
        return f"❌ Failed to connect to API: {str(e)}"
    except Exception as e:
        logger.exception("Unexpected error in external_api_tool: %s", e)
        return f"❌ Unexpected error: {str(e)}"
```

### Log But Don't Raise

```python
async def risky_operation(ctx: RunContext[UnifiedDeps]) -> str:
    try:
        result = perform_operation()
        return result
    except Exception as e:
        # Always log for debugging
        logger.exception("Risky operation failed: %s", e)
        
        # Return error string, don't raise
        return f"❌ Operation failed: {str(e)}"
```

---

## Review Checklist

When adding a new tool, verify:
- [ ] No `raise` statements in tool function body
- [ ] All validation errors return error strings
- [ ] All exceptions are caught and returned as strings
- [ ] Error messages use ❌ emoji for visibility
- [ ] Error messages are actionable
- [ ] Logging is present for debugging
- [ ] Return type matches function signature

---

## Fixed Issues in This Implementation

### ✅ Fixed: Plan Tools
- `update_plan_step()` - Now returns error string if plan not found
- `update_plan_status()` - Now returns error string if plan not found
- `rename_plan()` - Now returns error string if plan not found
- `delete_plan()` - Now returns error string if plan not found

### ✅ Fixed: Auxiliary Agent Tools
- `generate_images()` - Returns error list if agent not configured
- `web_search()` - Returns error string if agent not configured
- `code_execution()` - Returns error string if agent not configured
- `url_context()` - Returns error string if agent not configured

### ✅ Fixed: Graph Tool
- `run_graph()` - Returns ToolReturn with error message instead of raising

---

## Exceptions That Are OK to Raise

These are **NOT** tool functions, so raising is acceptable:

### Configuration/Setup Functions
```python
def get_config() -> dict:
    config = load_config()
    if not config:
        raise RuntimeError("Configuration not found")  # OK - setup time
    return config
```

### Factory Functions
```python
def create_agent(...) -> Agent:
    if not api_key:
        raise ValueError("API key required")  # OK - creation time
    return Agent(...)
```

### Internal Helpers (Not Called by Agent)
```python
def _internal_parser(data: str) -> dict:
    if not data:
        raise ValueError("Empty data")  # OK - internal only
    return parse(data)
```

---

## Summary

**Golden Rule:** If the function is registered in `BACKEND_TOOLS` and called by the agent, it must **NEVER raise exceptions**. Always return error strings/ToolReturn.

This ensures:
- ✅ Graceful error handling
- ✅ Agent continues running
- ✅ User gets helpful feedback
- ✅ Debugging is easier
- ✅ Robust conversational experience

**All tools in `backend_tools.py` have been reviewed and fixed!** ✅

