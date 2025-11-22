"""Backend tool definitions for agents.

This module contains all backend tools that agents can use. Backend tools are
Python functions that run on the server and have access to the agent's state.

## Adding a New Backend Tool

1. Define your tool function in this file:
   - Function can be sync or async
   - First parameter must be `ctx: RunContext[StateDeps[AgentState]]`
   - Add clear docstring with Args and Returns
   - Add type hints for all parameters

2. Add the tool to the BACKEND_TOOLS dictionary at the bottom

3. Add the tool to your database with tool_type='backend'

Example:
    def my_new_tool(ctx: RunContext[StateDeps[AgentState]], param1: str, param2: int = 5) -> str:
        '''Description of what this tool does.
        
        Args:
            ctx: The run context with agent state
            param1: Description of param1
            param2: Description of param2 (optional, default 5)
            
        Returns:
            Description of return value
        '''
        # Tool implementation
        return "result"
    
    # Then add to BACKEND_TOOLS:
    BACKEND_TOOLS = {
        'my_new_tool': my_new_tool,
        # ... other tools
    }
"""

from __future__ import annotations

from pydantic import BaseModel
from pydantic_ai import Agent, RunContext, BinaryImage, ImageGenerationTool, WebSearchTool, CodeExecutionTool, UrlContextTool, ToolReturn
from pydantic_ai.ag_ui import StateDeps
from ag_ui.core import EventType, StateSnapshotEvent, StateDeltaEvent, CustomEvent

from core.models import AgentState, Step, StepStatus

from pydantic_ai import ModelSettings
from pydantic_ai.models.google import GoogleModel, GoogleModelSettings
from pydantic_ai.providers.google import GoogleProvider
from core.models import JSONPatchOp

# Import Firebase Storage utility
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))
from utils.firebase_storage import upload_binary_image_to_storage

# ========== State Management Tools ==========

async def create_plan(ctx: RunContext[StateDeps[AgentState]], steps: list[str]) -> ToolReturn:
    """Create a plan with multiple steps.
    
    Args:
        ctx: The run context with agent state
        steps: List of step descriptions to create
        
    Returns:
        StateSnapshotEvent with updated state
    """
    print(f"📝 Creating plan with {len(steps)} steps")
    print(f"   Current state before: steps={len(ctx.deps.state.steps)}")
    ctx.deps.state.steps = [Step(description=step) for step in steps]
    print(f"   State after: steps={len(ctx.deps.state.steps)}")
    state_dict = ctx.deps.state.model_dump()
    print(f"   Returning snapshot: {state_dict}")

    return ToolReturn(
        return_value='Plan Created',
        metadata=[
            StateSnapshotEvent(
                type=EventType.STATE_SNAPSHOT,
                snapshot=state_dict,
            ),
        ],
    )


async def update_plan_step(
    ctx: RunContext[StateDeps[AgentState]],
    index: int,
    description: str | None = None,
    status: StepStatus | None = None
) -> ToolReturn:
    """Update a specific step in the plan.
    
    Args:
        ctx: The run context with agent state
        index: Index of the step to update
        description: New description for the step (optional)
        status: New status for the step (optional)
        
    Returns:
        StateSnapshotEvent with updated state
        
    Raises:
        ValueError: If step index doesn't exist
    """
    print(f"🔄 Updating step {index}: description={description}, status={status}")
    print(f"   Current state: {len(ctx.deps.state.steps)} steps")

    if not ctx.deps.state.steps or index >= len(ctx.deps.state.steps):
        error_msg = f"Step at index {index} does not exist. Current steps count: {len(ctx.deps.state.steps)}"
        print(f"   ❌ ERROR: {error_msg}")
        print(f"   Current steps: {[s.description for s in ctx.deps.state.steps]}")
        raise ValueError(error_msg)

    if description is not None:
        ctx.deps.state.steps[index].description = description
    if status is not None:
        ctx.deps.state.steps[index].status = status

    state_dict = ctx.deps.state.model_dump()
    print(f"   ✅ Updated step {index}, returning full snapshot: {state_dict}")

    return ToolReturn(
        return_value='Plan Step Updated',
        metadata=[
            StateSnapshotEvent(
                type=EventType.STATE_SNAPSHOT,
                snapshot=state_dict,
            ),
        ],
    )
    # changes: list[JSONPatchOp] = []
    # if description is not None:
    #     changes.append(
    #         JSONPatchOp(
    #             op='replace', path=f'/steps/{index}/description', value=description
    #         )
    #     )
    # if status is not None:
    #     changes.append(
    #         JSONPatchOp(op='replace', path=f'/steps/{index}/status', value=status)
    #     )
    
    # print(f"   ✅ Changes: {changes}")
    # return StateDeltaEvent(
    #     type=EventType.STATE_DELTA,
    #     delta=changes,
    # )


# ========== Utility Tools ==========

def get_weather(_: RunContext[StateDeps[AgentState]], location: str) -> str:
    """Get the weather for a given location.
    
    Args:
        location: City or location name
        
    Returns:
        Weather description string
    """
    return f"The weather in {location} is sunny."


# ========== Image Generation Tools ==========

google_provider = GoogleProvider(api_key='AIzaSyCID3PMug--i65c02xdw_FB-wyVTXJ3wHs')
google_model = GoogleModel(model_name='gemini-2.5-flash-image', provider=google_provider)
web_search_model = GoogleModel(model_name='gemini-2.5-flash', provider=google_provider)
code_execution_model = GoogleModel(model_name='gemini-2.5-flash', provider=google_provider)
memory_model = GoogleModel(model_name='gemini-2.5-flash', provider=google_provider)
url_context_model = GoogleModel(model_name='gemini-2.5-flash', provider=google_provider)

web_search_agent = Agent(
    model=web_search_model,
    builtin_tools=[WebSearchTool()],
    system_prompt=(
        "You are a web search assistant. Based on the user's prompt, "
        "search the web for relevant information. "
        "Return the search results."
    ),
)

code_execution_agent = Agent(
    model=code_execution_model,
    builtin_tools=[CodeExecutionTool()],
    system_prompt=(
        "You are a code execution assistant. Based on the user's prompt, "
        "execute the code and return the results. "
        "ALWAYS return both the code execution results and the code itself."
    ),
)

url_context_agent = Agent(
    model=url_context_model,
    builtin_tools=[UrlContextTool()],
    system_prompt=(
        "You are a URL context assistant. Based on the user's prompt, "
        "load the content from the provided URLs. "
        "Return the content from the URLs."
    ),
)

# Create a Pydantic AI agent for image generation with structured output
image_generation_agent = Agent(
    model=google_model,
    # output_type=ImageGenerationResult,
    builtin_tools=[ImageGenerationTool()],
    system_prompt=(
        "You are an image generation assistant. Based on the user's prompt, "
        "generate a list of image URLs (use placeholder URLs from https://picsum.photos/), "
        "refine the prompt for better image generation, and identify the artistic style. "
        "Return exactly the number of images requested."
    ),
)


async def generate_images(
    _: RunContext[StateDeps[AgentState]], 
    prompt: str, 
    num_images: int = 1
) -> list[str]:
    """Generate images based on a text prompt using AI and upload to Firebase Storage.
    
    This function uses Gemini's image generation capability to create images,
    then uploads them to Firebase Storage in the 'generations' folder, matching
    the same Firebase configuration as the frontend takeScreenshot function.
    
    Args:
        prompt: Text description of the images to generate
        num_images: Number of images to generate (default: 1)
        
    Returns:
        List of public URLs pointing to the uploaded images in Firebase Storage
    """
    # print(f"🎨 Generating {num_images} images based on prompt: {prompt}")
    
    try:
        # Use the AI agent to generate images
        result = await image_generation_agent.run(
            f"Generate {num_images} image(s) based on this prompt: {prompt}"
        )
                
        # Upload each BinaryImage to Firebase Storage
        uploaded_urls = []
        
        for idx, image in enumerate(result.response.images):
            if isinstance(image, BinaryImage):
                print(f"🎨 Uploading image {idx + 1}/{len(result.response.images)} to Firebase Storage...")
                
                # Get the binary data from BinaryImage
                # BinaryImage has a 'data' attribute with the bytes
                image_data = image.data
                
                # Determine content type from media type
                content_type = image.media_type or "image/png"
                
                # Upload to Firebase Storage in 'generations' folder
                url = await upload_binary_image_to_storage(
                    image_data,
                    folder="generations",
                    content_type=content_type
                )
                
                if url:
                    uploaded_urls.append(url)
                    print(f"   ✅ Uploaded: {url}")
                else:
                    print(f"   ⚠️ Failed to upload image {idx + 1}")
            else:
                print(f"   ⚠️ Unexpected image type: {type(image)}")
        
        if not uploaded_urls:
            print("⚠️ No images were successfully uploaded, returning placeholder URLs")
            return []
        
        print(f"🎨 Successfully uploaded {len(uploaded_urls)} images to Firebase Storage")
        return uploaded_urls
        
    except Exception as e:
        print(f"❌ Error generating/uploading images: {e}")
        return []


async def web_search(ctx: RunContext[StateDeps[AgentState]], prompt: str) -> str:

    result = await web_search_agent.run(prompt)
    return result.response.text

async def code_execution(ctx: RunContext[StateDeps[AgentState]], prompt: str) -> str:
    result = await code_execution_agent.run(prompt)
    return result.response.text

async def url_context(ctx: RunContext[StateDeps[AgentState]], urls: list[str]) -> str:
    result = await url_context_agent.run(urls)
    return result.response.text

# ========== Tool Registry ==========
# Maps tool keys to their function implementations

BACKEND_TOOLS = {
    'create_plan': create_plan,
    'update_plan_step': update_plan_step,
    'get_weather': get_weather,
    'generate_images': generate_images,
    'web_search': web_search,
    'code_execution': code_execution,
    'url_context': url_context,
}


def get_backend_tool(tool_key: str):
    """Get a backend tool by its key.
    
    Args:
        tool_key: The tool identifier (e.g., 'create_plan')
        
    Returns:
        The tool function, or None if not found
    """
    return BACKEND_TOOLS.get(tool_key)


def list_backend_tools() -> list[str]:
    """List all available backend tool keys.
    
    Returns:
        List of tool key strings
    """
    return list(BACKEND_TOOLS.keys())

