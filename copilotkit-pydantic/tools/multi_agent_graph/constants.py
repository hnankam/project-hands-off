"""Constants for multi-agent graph orchestration."""

# Coagent name used by frontend to render graph state
# Must match the agent name used in CopilotKit setup (dynamic_agent)
GRAPH_COAGENT_NAME = "dynamic_agent"

# Thinking instruction added to all agent prompts
THINKING_INSTRUCTION = (
    "\n\n## THINKING REQUIREMENT\n"
    "ALWAYS return your thinking within <think>...</think> tags. "
    "Be sure to close the <think> tag with </think>."
)

# Default model names
DEFAULT_GENERAL_MODEL = "gemini-2.5-flash"
DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image"

