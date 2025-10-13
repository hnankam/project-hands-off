from __future__ import annotations

from textwrap import dedent
from typing import Any, Literal
from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelSettings, RunContext
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.run import AgentRunResult

from pydantic_ai.ag_ui import StateDeps
from ag_ui.core import EventType, StateDeltaEvent, StateSnapshotEvent
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.models.google import GoogleModelSettings
from pydantic_ai.models.anthropic import AnthropicModelSettings
import os

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
        description='The status of the step: pending (not started), running (in progress), completed (successfully finished), or failed (encountered an error)',
    )

class Plan(BaseModel):
    """Represents a plan with multiple steps."""

    steps: list[Step] = Field(default_factory=list, description='The steps in the plan')

class JSONPatchOp(BaseModel):
    """A class representing a JSON Patch operation (RFC 6902)."""

    op: Literal['add', 'remove', 'replace', 'move', 'copy', 'test'] = Field(
        description='The operation to perform: add, remove, replace, move, copy, or test',
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
    frequency_penalty=0,
    presence_penalty=0,
)

google_model_settings = GoogleModelSettings(
    google_thinking_config={'include_thoughts': True},
    temperature=0.0,
    max_tokens=2048,
    frequency_penalty=0,
    presence_penalty=0,
)

anthropic_model_settings = AnthropicModelSettings(
    anthropic_thinking={'type': 'enabled', 'budget_tokens': 1024},
    temperature=0.0,
    max_tokens=2048,
    frequency_penalty=0,
    presence_penalty=0,
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
        # GENERAL INSTRUCTIONS
         - When you get an inquiry, ALWAYS build a plan to answer the user's inquiry. DO NOT answer the inquiry directly unless it can be answered in a single step.
         - ONLY use the tools available to you. Do not use tools that are not available to you.
         - Unless otherwise specified, ONLY call a tool after obtaining the response of the previous tool call.
         - Return all reasoning/thinking response in <thinking>...</thinking> tags.
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
        You are a helpful general-purpose AI assistant.
        You can help with a wide variety of tasks and questions.
        Be concise, accurate, and helpful in your responses.

        - ALWAYS CREATE A DETAILED PLAN TO ANSWER THE USER'S INQUIRY. DO NOT ANSWER THE INQUIRY WITHOUT A PLAN.
        - Return all reasoning/thinking response in <thinking>...</thinking> tags.

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
provider = GoogleProvider(api_key=os.getenv('GOOGLE_API_KEY'))
MODELS = {
    'gemini-2.5-flash-lite': {'model': GoogleModel('gemini-2.5-flash-lite', provider=provider), 'model_settings': google_model_settings},
    'gemini-2.5-flash': {'model': GoogleModel('gemini-2.5-flash', provider=provider), 'model_settings': google_model_settings},
    'gemini-2.5-pro': {'model': GoogleModel('gemini-2.5-pro', provider=provider), 'model_settings': google_model_settings},
    'claude-3.5-sonnet': {'model': 'bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0', 'model_settings': anthropic_model_settings},
    'claude-3.7-sonnet': {'model': 'bedrock:us.anthropic.claude-3-7-sonnet-20250219-v1:0', 'model_settings': anthropic_model_settings},
    'claude-4.1-opus': {'model': 'bedrock:us.anthropic.claude-opus-4-1-20250805-v1:0', 'model_settings': anthropic_model_settings},
    'claude-4.5-sonnet': {'model': 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'model_settings': anthropic_model_settings},
}

# =====
# Agent Factory Function
# =====

# Use a cheaper model to summarize old messages.
def create_summarize_agent():
    summarize_agent = Agent(MODELS['gemini-2.5-flash-lite'],
    instructions="""
        Summarize this conversation, omitting small talk and unrelated topics.
        Focus on the technical discussion and next steps.
        """,
    )
    return summarize_agent

async def summarize_old_messages(ctx: RunContext[StateDeps[AgentState]], messages: list[ModelMessage]) -> list[ModelMessage]:
    # Summarize if we've used more than 150000 tokens
    if ctx.usage.total_tokens > 150000:
        oldest_messages = messages[:10]
        summary = await summarize_agent.run(message_history=oldest_messages)
        # Return the last message and the summary
        return summary.new_messages() + messages[-1:]

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
    system_prompt = AGENT_PROMPTS.get(agent_type, AGENT_PROMPTS["general"])
    # print(f"{system_prompt}")
    model = MODELS.get(model_name, MODELS['gemini-2.5-flash-lite'])['model']
    model_settings = MODELS.get(model_name, MODELS['gemini-2.5-flash-lite'])['model_settings']
    
    agent = Agent(
        model,
        deps_type=StateDeps[AgentState],
        system_prompt=system_prompt,
        model_settings=model_settings,
    )
    
    # Add tools to the agent
    
    @agent.tool
    async def create_plan(ctx: RunContext[StateDeps[AgentState]], steps: list[str]) -> StateSnapshotEvent:
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

    @agent.tool
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

    @agent.tool
    def get_proverbs(ctx: RunContext[StateDeps[AgentState]]) -> list[str]:
        """Get the current list of proverbs."""
        print(f"📖 Getting proverbs: {ctx.deps.state.proverbs}")
        return ctx.deps.state.proverbs

    @agent.tool
    async def add_proverbs(ctx: RunContext[StateDeps[AgentState]], proverbs: list[str]) -> StateSnapshotEvent:
        ctx.deps.state.proverbs.extend(proverbs)
        return StateSnapshotEvent(
            type=EventType.STATE_SNAPSHOT,
            snapshot=ctx.deps.state,
        )

    @agent.tool
    async def set_proverbs(ctx: RunContext[StateDeps[AgentState]], proverbs: list[str]) -> StateSnapshotEvent:
        ctx.deps.state.proverbs = proverbs
        return StateSnapshotEvent(
            type=EventType.STATE_SNAPSHOT,
            snapshot=ctx.deps.state,
        )

    @agent.tool
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
