from __future__ import annotations

from anthropic import AsyncAnthropicBedrock
from pydantic_ai.models.bedrock import BedrockConverseModel

from textwrap import dedent
from typing import Any, Literal
from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelSettings, RunContext
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, SystemPromptPart, ToolCallPart, ToolReturnPart
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.run import AgentRunResult


from pydantic_ai.ag_ui import StateDeps
from ag_ui.core import EventType, StateDeltaEvent, StateSnapshotEvent
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.models.google import GoogleModelSettings
from pydantic_ai.models.anthropic import AnthropicModelSettings
from pydantic_ai.models.bedrock import BedrockModelSettings
import os, json
from AnthropicWithCache import AnthropicModelWithCache
from history_processor.compactor import (CompactContext, CompactorProcessor)


# import logfire
# logfire.configure()
# logfire.instrument_pydantic_ai()

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

StepStatus = Literal['pending', 'running', 'completed', 'failed', 'deleted']

class Step(BaseModel):
    """Represents a step in a plan."""

    description: str = Field(description='The description of the step')
    status: StepStatus = Field(
        default='pending',
        description='The status of the step (e.g. pending, running, completed, failed, deleted)',
    )

class Plan(BaseModel):
    """Represents a plan with multiple steps."""

    steps: list[Step] = Field(default_factory=list, description='The steps in the plan')

class JSONPatchOp(BaseModel):
    """A class representing a JSON Patch operation (RFC 6902)."""

    op: Literal['add', 'remove', 'replace', 'move', 'copy', 'test'] = Field(
        description='The operation to perform (e.g. add, remove, replace, move, copy, test)',
    )
    path: str = Field(description='JSON Pointer (RFC 6901) to the target location')
    value: Any = Field(
        default=None,
        description='The value to apply (for add, replace operations)',
    )
    from_: str | None = Field(
        default=None,
        alias='from',
        description='Source path (for move, copy operations)',
    )


model_settings = ModelSettings(
    temperature=0.0,
    max_tokens=2048,
)

google_model_settings = GoogleModelSettings(
    google_thinking_config={'include_thoughts': True, 'thinking_budget': 1024}, # -1 for dynamic thinking
    temperature=0.0,
    max_tokens=2048,
)

anthropic_model_settings=AnthropicModelSettings(
    extra_headers={"anthropic-beta": "fine-grained-tool-streaming-2025-05-14"},
   # anthropic_thinking={'type': 'enabled', 'budget_tokens': 1024}, # Not supported on 3.5 sonnet and CopilotChat doesn't return thinking parts
    # temperature=1,
    # max_tokens=2048,
    )

bedrock_model_settings = BedrockModelSettings(
        bedrock_additional_model_requests_fields={
            "thinking": {"type": "enabled", "budget_tokens": 1024},
            "max_tokens": 2048,
        },
    )

# =====
# State
# =====
class AgentState(BaseModel):
  """List of the proverbs being written."""
  proverbs: list[str] = Field(
    default_factory=list,
    description='The list of already written proverbs'
  )
  steps: list[Step] = Field(
    default_factory=list,
    description='The steps in the plan'
  )

# =====
# System Prompts for Different Agent Types
# =====

general_instruction = """
        You are a James Bond-style assistant that helps users with their UI/UX tasks. Your code name is "Raven Red".

        When given a task, ALWAYS create a plan to complete the task unless the task can be completed in a single step. When planning use tools only, without any other messages.
        IMPORTANT:
        - Use the `create_plan` tool to set the initial state of the steps
        - Use the `update_plan_step` tool to update the status of each step
        - Do NOT repeat the plan or summarise it in a message
        - Do NOT confirm the creation or updates in a message
        - Do NOT rerun a tool until you have the response from the previous tool call

        Only one plan can be active at a time, so do not call the `create_plan` tool
        again until all the steps in current plan are completed and the plan has been reset.
        """.strip()

planning_instruction = """
        IMPORTANT:
        When creating and executing plans:
        - Use the `create_plan` tool to set up a multi-step plan
        - Use the `update_plan_step` tool to update step status: 'running' when starting, 'completed' when done, 'failed' if error
        - After each tool call, provide a brief confirmation or next step
        - Execute each step in order, updating status as you go
        - **SKIP ANY STEPS WITH STATUS 'deleted' - do not process or reference deleted steps**
        - Mark a step as 'running' before you start working on it
        - Mark as 'completed' when successfully finished, or 'failed' if it encounters an error
        - Do NOT leave a plan hanging - always complete all non-deleted steps

        Only one plan can be active at a time, so do not call the `create_plan` tool
        again until all the non-deleted steps in current plan are completed or failed.
        """.strip()

AGENT_PROMPTS = {
    "general": dedent("""
        {general_instruction}
        {planning_instruction}
    """.format(general_instruction=general_instruction, planning_instruction=planning_instruction)).strip(),
    
    "wiki": dedent("""
        You are a Wikipedia-style knowledge assistant.
        You provide factual, well-structured information on any topic.
        Format your responses like encyclopedia entries with clear sections.
        Always cite sources when possible and acknowledge when information may be uncertain.

        {general_instruction}
        {planning_instruction}
    """.format(general_instruction=general_instruction, planning_instruction=planning_instruction)).strip(),
    
    "sharepoint": dedent("""
        You are a SharePoint and Microsoft 365 expert assistant.
        You help users with:
        - SharePoint site management and configuration
        - Document libraries and lists
        - Permissions and security
        - Workflows and automation
        - Integration with other Microsoft 365 apps
        Provide step-by-step guidance and best practices.

        {general_instruction}
        {planning_instruction}
    """.format(general_instruction=general_instruction, planning_instruction=planning_instruction)).strip(),
    
    "excel": dedent("""
        You are an Excel and spreadsheet expert assistant.
        You help users with:
        - Excel formulas and functions
        - Data analysis and visualization
        - Pivot tables and charts
        - Macros and VBA
        - Data cleaning and transformation
        Provide clear examples and explain complex concepts simply.

        {general_instruction}
        {planning_instruction}
    """.format(general_instruction=general_instruction, planning_instruction=planning_instruction)).strip(),
    
    "word": dedent("""
        You are a Microsoft Word and document formatting expert assistant.
        You help users with:
        - Document formatting and styles
        - Templates and mail merge
        - Tables of contents and references
        - Collaboration and track changes
        - Professional document design
        Provide clear instructions and formatting tips.

        {general_instruction}
        {planning_instruction}
    """.format(general_instruction=general_instruction, planning_instruction=planning_instruction)).strip(),
    
    "databricks": dedent("""
        You are a Databricks and big data analytics expert assistant.
        You help users with:
        - Databricks workspace and clusters
        - Apache Spark and PySpark
        - Data engineering pipelines
        - ML workflows and MLflow
        - Delta Lake and data lakehouse architecture
        Provide code examples and best practices for data engineering.

        {general_instruction}
        {planning_instruction}
    """.format(general_instruction=general_instruction, planning_instruction=planning_instruction)).strip(),
    
    "powerpoint": dedent("""
        You are a PowerPoint and presentation design expert assistant.
        You help users with:
        - Slide design and layouts
        - Animations and transitions
        - Data visualization in presentations
        - Speaker notes and rehearsal
        - Professional presentation tips
        Provide creative ideas and design suggestions.

        {general_instruction}
        {planning_instruction}
    """.format(general_instruction=general_instruction, planning_instruction=planning_instruction)).strip(),
}

# =====
# Models
# =====

# Google Models
google_provider = GoogleProvider(api_key=os.getenv('GOOGLE_API_KEY'))

anthropic_provider = AnthropicProvider(anthropic_client=AsyncAnthropicBedrock())

MODELS = {
    'gemini-2.5-flash-lite': {'model': GoogleModel('gemini-2.5-flash-lite', provider=google_provider), 'model_settings': google_model_settings},
    'gemini-2.5-flash': {'model': GoogleModel('gemini-2.5-flash', provider=google_provider), 'model_settings': google_model_settings},
    'gemini-2.5-pro': {'model': GoogleModel('gemini-2.5-pro', provider=google_provider), 'model_settings': google_model_settings},
    'claude-3.5-sonnet': {'model': AnthropicModelWithCache('us.anthropic.claude-3-5-sonnet-20241022-v2:0', provider=anthropic_provider), 'model_settings': anthropic_model_settings},
    'claude-3.7-sonnet': {'model': AnthropicModelWithCache('us.anthropic.claude-3-7-sonnet-20250219-v1:0', provider=anthropic_provider), 'model_settings': anthropic_model_settings},
    'claude-4.1-opus': {'model': AnthropicModelWithCache('us.anthropic.claude-opus-4-1-20250805-v1:0', provider=anthropic_provider), 'model_settings': anthropic_model_settings},
    'claude-4.5-sonnet': {'model': AnthropicModelWithCache('us.anthropic.claude-sonnet-4-5-20250929-v1:0', provider=anthropic_provider), 'model_settings': anthropic_model_settings},
#     'claude-3.5-sonnet': {'model': BedrockConverseModel('us.anthropic.claude-3-5-sonnet-20241022-v2:0'), 'model_settings': bedrock_model_settings},
#     'claude-3.7-sonnet': {'model': BedrockConverseModel('us.anthropic.claude-3-7-sonnet-20250219-v1:0'), 'model_settings': bedrock_model_settings},
#     'claude-4.1-opus': {'model': BedrockConverseModel('us.anthropic.claude-opus-4-1-20250805-v1:0'), 'model_settings': bedrock_model_settings},
#     'claude-4.5-sonnet': {'model': BedrockConverseModel('us.anthropic.claude-sonnet-4-5-20250929-v1:0'), 'model_settings': bedrock_model_settings},
}

# =====
# Agent Factory Function
# =====

# async def message_at_index_contains_tool_return_parts(messages: list[ModelMessage], index: int) -> bool:
#     return any(isinstance(part, ToolReturnPart) for part in messages[index].parts)
    
# async def keep_recent_messages(ctx: RunContext[StateDeps[AgentState]], messages: list[ModelMessage]) -> list[ModelMessage]:
#     number_of_messages = len(messages)


#     for index, message in enumerate(messages):
#         print(f"====================Message {index}============================")
#         print(f"Message: {message}")
#         print(f"Message parts: {message.parts}")
#         print(f"================================================")

#     number_of_messages_to_keep = 15
#     if number_of_messages <= number_of_messages_to_keep:
#         print(f"Skipping delete of recent messages as there are less than {number_of_messages_to_keep} messages")
#         return messages
    
#     if (await message_at_index_contains_tool_return_parts(messages, number_of_messages - number_of_messages_to_keep)):
#         print(f"Skipping deleting messages as there are tool return parts at index {number_of_messages - number_of_messages_to_keep}")
#         return messages
#     print(f"Keeping {number_of_messages_to_keep} messages")
#     return messages[-number_of_messages_to_keep:]


async def keep_recent_messages(ctx: RunContext[StateDeps[AgentState]], messages: list[ModelMessage]) -> list[ModelMessage]:
    """
    Keep only recent messages while preserving AI model message ordering rules.

    Most AI models require proper sequencing of:
    - Tool/function calls and their corresponding returns
    - User messages and model responses
    - Multi-turn conversations with proper context

    This means we cannot cut conversation history in a way that:
    - Leaves tool calls without their corresponding returns
    - Separates paired messages inappropriately
    - Breaks the logical flow of multi-turn interactions

    Reference: https://github.com/pydantic/pydantic-ai/issues/2050
    """

    for index, message in enumerate(messages):
        print(f"====================Message {index}============================")
        print(f"Message: {message}")
        print(f"Message parts: {message.parts}")
        print(f"===============================================================")

    message_window = 15

    if len(messages) <= message_window:
        print(f"Returning {len(messages)} messages as there are less than {message_window} messages")
        return messages

    print(f"Performing history compaction... with message window {message_window}")

    # Find system prompt if it exists
    system_prompt = None
    system_prompt_index = None
    for i, msg in enumerate(messages):
        if isinstance(msg, ModelRequest) and any(isinstance(part, SystemPromptPart) for part in msg.parts):
            system_prompt = msg
            system_prompt_index = i
            break
    
    # Start at target cut point and search backward (upstream) for a safe cut
    target_cut = len(messages) - message_window

    for cut_index in range(target_cut, -1, -1):
        first_message = messages[cut_index]

        # Skip if first message has tool returns (orphaned without calls)
        if any(isinstance(part, ToolReturnPart) for part in first_message.parts):
            continue

        # Skip if first message has tool calls (violates AI model ordering rules)
        if isinstance(first_message, ModelResponse) and any(
            isinstance(part, ToolCallPart) for part in first_message.parts
        ):
            continue

        # Found a safe cut point
        print(f"Found a safe cut point at {cut_index}")
        result = messages[cut_index:]

        # If we cut off the system prompt, prepend it back
        if system_prompt is not None and system_prompt_index is not None and cut_index > system_prompt_index:
            result = [system_prompt] + result

        print(f"Returning {len(result)} messages after cut")
        return result

    # No safe cut point found, keep all messages
    print(f"Returning {len(messages)} messages")
    return messages

def create_usage_tracking_callback(session_id: str, agent_type: str, model: str, broadcast_func):
    """Factory function that creates an OnCompleteFunc that broadcasts usage via WebSocket.
    
    Args:
        session_id: The session ID to associate with this usage
        agent_type: The type of agent (general, wiki, etc.)
        model: The model name
        broadcast_func: Async function to broadcast usage updates
        
    Returns:
        An async callback function that broadcasts usage on completion.
    """
    async def on_complete_usage_tracking(result: AgentRunResult[Any]):
        """OnCompleteFunc to track token usage and broadcast via WebSocket.
        
        This callback receives AgentRunResult and broadcasts usage information.
        """
        # Get usage information from the result
        usage = result.usage()
        
        usage_data = {
            "session_id": session_id,
            "agent_type": agent_type,
            "model": model,
            "request_tokens": usage.request_tokens or 0,
            "response_tokens": usage.response_tokens or 0,
            "total_tokens": usage.total_tokens or 0,
            "timestamp": None,  # Will be set by broadcast function
        }
        
        print(f"📊 Usage: session={session_id}, "
              f"request_tokens={usage_data['request_tokens']}, "
              f"response_tokens={usage_data['response_tokens']}, "
              f"total={usage_data['total_tokens']}")
        
        # Broadcast usage to connected WebSocket clients by session
        await broadcast_func(session_id, usage_data)
    
    return on_complete_usage_tracking

def create_agent(agent_type: str, model_name: str):
    """Create an agent with the specified type and model."""
    instructions = AGENT_PROMPTS.get(agent_type, AGENT_PROMPTS["general"])
    # if agent_type == 'general':
    #     print(f"🔧 General System Prompt: {system_prompt}")
    model = MODELS.get(model_name, MODELS['gemini-2.5-flash-lite'])['model']
    model_settings = MODELS.get(model_name, MODELS['gemini-2.5-flash-lite'])['model_settings']
    
    agent = Agent(
        model,
        instructions=instructions,
        deps_type=StateDeps[AgentState],
        model_settings=model_settings,
        history_processors=[keep_recent_messages],
        retries=3,
    )

    agent.sequential_tool_calls()
    
    @agent.tool(sequential=True, retries=0)
    async def tool_plain(ctx: RunContext[StateDeps[AgentState]], steps: list[str]) -> StateSnapshotEvent:
        """Create a plan with multiple steps.
        
        After calling this tool, you MUST provide a text response to the user confirming the plan was created and what you'll do next.

        Args:
            steps: List of step descriptions to create the plan.

        Returns:
            StateSnapshotEvent containing the initial state of the steps.
        """
        print(f"📝 Creating plan with {len(steps)} steps")
        print(f"   Current state before: proverbs={len(ctx.deps.state.proverbs)}, steps={len(ctx.deps.state.steps)}")
        
        # Update the steps in the current state, preserving other fields like proverbs
        ctx.deps.state.steps = [Step(description=step) for step in steps]
        
        print(f"   State after: proverbs={len(ctx.deps.state.proverbs)}, steps={len(ctx.deps.state.steps)}")
        
        # Serialize state to dict for the snapshot
        state_dict = ctx.deps.state.model_dump()
        print(f"   Returning snapshot: {state_dict}")
        
        # Return state snapshot event
        return StateSnapshotEvent(
            type=EventType.STATE_SNAPSHOT,
            snapshot=state_dict,
        )

    @agent.tool(sequential=True, retries=0)
    async def update_plan_step(
        ctx: RunContext[StateDeps[AgentState]],
        index: int, 
        description: str | None = None, 
        status: StepStatus | None = None
    ) -> StateSnapshotEvent:
        """Update the plan with new steps or changes.
        
        After calling this tool, you MUST provide a text response to the user about what you did and what's next.

        Args:
            index: The index of the step to update.
            description: The new description for the step.
            status: The new status for the step.

        Returns:
            StateSnapshotEvent containing the updated state.
        """
        print(f"🔄 Updating step {index}: description={description}, status={status}")
        print(f"   Current state: {len(ctx.deps.state.steps)} steps")
        
        # Validate that the step exists
        if not ctx.deps.state.steps or index >= len(ctx.deps.state.steps):
            error_msg = f"Step at index {index} does not exist. Current steps count: {len(ctx.deps.state.steps)}"
            print(f"   ❌ ERROR: {error_msg}")
            print(f"   Current steps: {[s.description for s in ctx.deps.state.steps]}")
            raise ValueError(error_msg)
        
        # Apply updates to the state object (this persists the changes)
        if description is not None:
            ctx.deps.state.steps[index].description = description
        if status is not None:
            ctx.deps.state.steps[index].status = status
        
        # Serialize state to dict for the snapshot
        state_dict = ctx.deps.state.model_dump()
        print(f"   ✅ Updated step {index}, returning full snapshot: {state_dict}")
        
        # Return full state snapshot
        return StateSnapshotEvent(
            type=EventType.STATE_SNAPSHOT,
            snapshot=state_dict,
        )

    @agent.tool(sequential=True, retries=0)
    def get_proverbs(ctx: RunContext[StateDeps[AgentState]]) -> list[str]:
        """Get the current list of proverbs."""
        print(f"📖 Getting proverbs: {ctx.deps.state.proverbs}")
        return ctx.deps.state.proverbs

    @agent.tool(sequential=True, retries=0)
    async def add_proverbs(ctx: RunContext[StateDeps[AgentState]], proverbs: list[str]) -> StateSnapshotEvent:
        ctx.deps.state.proverbs.extend(proverbs)
        return StateSnapshotEvent(
            type=EventType.STATE_SNAPSHOT,
            snapshot=ctx.deps.state,
        )

    @agent.tool(sequential=True, retries=0)
    async def set_proverbs(ctx: RunContext[StateDeps[AgentState]], proverbs: list[str]) -> StateSnapshotEvent:
        ctx.deps.state.proverbs = proverbs
        return StateSnapshotEvent(
            type=EventType.STATE_SNAPSHOT,
            snapshot=ctx.deps.state,
        )

    @agent.tool(sequential=True, retries=0)
    def get_weather(_: RunContext[StateDeps[AgentState]], location: str) -> str:
        """Get the weather for a given location. Ensure location is fully spelled out."""
        return f"The weather in {location} is sunny."
    
    return agent

# =====
# Agent Cache for Dynamic Creation
# =====

_agent_cache = {}

def get_agent(agent_type: str, model_name: str):
    """Get or create an agent with caching."""
    cache_key = f"{agent_type}:{model_name}"
    
    if cache_key not in _agent_cache:
        print(f"🔧 Creating new agent: {agent_type} with model {model_name}")
        _agent_cache[cache_key] = create_agent(agent_type, model_name)
    
    return _agent_cache[cache_key]
