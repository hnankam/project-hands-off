from __future__ import annotations

from pydantic import BaseModel
from pydantic_ai import Agent, RunContext, BinaryImage, ImageGenerationTool
from pydantic_ai.ag_ui import StateDeps
from ag_ui.core import EventType, StateSnapshotEvent

from core.models import AgentState, Step, StepStatus

from pydantic_ai import ModelSettings
from pydantic_ai.models.google import GoogleModel, GoogleModelSettings
from pydantic_ai.providers.google import GoogleProvider

google_provider = GoogleProvider(api_key='AIzaSyCID3PMug--i65c02xdw_FB-wyVTXJ3wHs')
image_generation_model = GoogleModel(model_name='gemini-2.5-flash-image', provider=google_provider)
orchestrator_model = GoogleModel(model_name='gemini-2.5-flash', provider=google_provider)

# Create a Pydantic AI agent for image generation with structured output
image_generation_agent = Agent(
    model=image_generation_model,
    # output_type=ImageGenerationResult,
    builtin_tools=[ImageGenerationTool()],
    system_prompt=(
        "You are an image generation assistant. Based on the user's prompt, "
        "generate a list of image URLs (use placeholder URLs from https://picsum.photos/), "
        "refine the prompt for better image generation, and identify the artistic style. "
        "Return exactly the number of images requested."
    ),
)

image_tools = image_generation_agent._builtin_tools
print(image_tools)

orchestrator_agent = Agent(
    model=orchestrator_model,
    tools=image_tools,
    system_prompt=(
        "You are an orchestrator agent that uses the image generation agent to generate images. "
        "You will be given a prompt and you will need to use the image generation agent to generate the images. "
    ),
)

result = orchestrator_agent.run_sync("Generate 1 image of a cat")
print(result)
