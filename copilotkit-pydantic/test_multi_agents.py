from __future__ import annotations

from pydantic import BaseModel
from pydantic_ai import Agent, RunContext, BinaryImage, ImageGenerationTool, WebSearchTool, CodeExecutionTool
from pydantic_ai.ag_ui import StateDeps
from ag_ui.core import EventType, StateSnapshotEvent

from core.models import AgentState, Step, StepStatus

from pydantic_ai import ModelSettings
from pydantic_ai.models.google import GoogleModel, GoogleModelSettings
from pydantic_ai.providers.google import GoogleProvider

google_provider = GoogleProvider(api_key='AIzaSyCID3PMug--i65c02xdw_FB-wyVTXJ3wHs')
image_generation_model = GoogleModel(model_name='gemini-2.5-flash-image', provider=google_provider)
orchestrator_model = GoogleModel(model_name='gemini-2.5-pro', provider=google_provider)

# Create a Pydantic AI agent for image generation with structured output
image_generation_agent = Agent(
    model=image_generation_model,
    # output_type=ImageGenerationResult,
    builtin_tools=[ImageGenerationTool()],
    system_prompt=(
        "You are an image generation assistant. Based on the user's prompt, "
        "generate an image based on the description provided. "
        "Use the image generation tool to create the image."
    ),
)

# Create a tool that delegates to the image generation agent
async def generate_image(ctx: RunContext[str], prompt: str) -> str:
    """Generate an image based on a text prompt.
    
    Args:
        prompt: The description of the image to generate
    
    Returns:
        Information about the generated image
    """
    print(f"Generating image for prompt: {prompt}")
    result = await image_generation_agent.run(prompt)
    print(f"Image generated: {len(result.response.images)}")
    return "Image generated successfully"

orchestrator_agent = Agent(
    model=orchestrator_model,
    builtin_tools=[WebSearchTool(), CodeExecutionTool()],
    # tools=[generate_image],
    system_prompt=(
        "You are an orchestrator agent that uses the image generation tool to generate images. "
        "When the user asks for images, use the generate_image tool with an appropriate prompt. "
    ),
)

# result = image_generation_agent.run_sync("Generate 1 image of a cat")
# print(result.response.text)

# result = orchestrator_agent.run_sync("Give me a sentence with the biggest news in AI this week.")
# print(result.response.text)

result = orchestrator_agent.run_sync("Calculate the factorial of 15.")
print(result.output)
print(result.response.builtin_tool_calls)