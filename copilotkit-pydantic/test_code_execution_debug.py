"""
Debug file to test code execution node with AGUIAdapter in isolation.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field

from pydantic_ai import Agent, CodeExecutionTool
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider
from ag_ui.core import CustomEvent, RunAgentInput, UserMessage
from ag_ui.encoder import EventEncoder
from anyio import create_memory_object_stream, create_task_group
from anyio.streams.memory import MemoryObjectSendStream
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE, AGUIAdapter

# Google provider and model
google_provider = GoogleProvider(api_key='AIzaSyCID3PMug--i65c02xdw_FB-wyVTXJ3wHs')
general_model = GoogleModel(model_name='gemini-2.5-flash', provider=google_provider)

# Create code execution agent
code_execution_agent = Agent(
    model=general_model,
    builtin_tools=[CodeExecutionTool()],
    system_prompt=(
        "You are a code execution assistant. Based on the user's prompt, "
        "execute the code and return the results. "
        "ALWAYS return both the code execution results and the code itself in the format: 'Code: <code>\nResults: <results>'."
    ),
)


async def test_code_execution_with_adapter(query: str):
    """Test code execution with AGUIAdapter to debug on_complete callback."""
    
    print(f"\n{'='*60}")
    print(f"Testing Code Execution with AGUIAdapter")
    print(f"{'='*60}")
    print(f"Query: {query}")
    print(f"{'='*60}\n")
    
    # Create RunAgentInput
    run_input = RunAgentInput(
        thread_id=uuid.uuid4().hex,
        run_id=uuid.uuid4().hex,
        messages=[
            UserMessage(
                id=f'msg_{uuid.uuid4().hex[:8]}',
                content=query,
            )
        ],
        state={},
        context=[],
        tools=[],
        forwarded_props=None,
    )
    
    # Create AGUIAdapter
    print(f"Creating AGUIAdapter...")
    adapter = AGUIAdapter(
        agent=code_execution_agent,
        run_input=run_input,
        accept=SSE_CONTENT_TYPE
    )
    
    # Variable to capture the final result
    final_result = None
    
    def on_complete(result):
        """Callback to capture the final result."""
        nonlocal final_result
        print(f"\n{'='*60}")
        print(f"on_complete callback triggered!")
        print(f"{'='*60}")
        print(f"Result type: {type(result)}")
        print(f"Has output: {hasattr(result, 'output')}")
        print(f"Has data: {hasattr(result, 'data')}")
        if hasattr(result, 'output'):
            print(f"Output: {result.output}")
        if hasattr(result, 'data'):
            print(f"Data: {result.data}")
        print(f"{'='*60}\n")
        final_result = result
    
    print(f"Starting adapter.run_stream with on_complete callback...\n")
    
    # Run the agent and stream events
    event_stream = adapter.run_stream(output_type=str, on_complete=on_complete)
    
    # Consume all events
    event_count = 0
    error_events = []
    
    print(f"Consuming event stream...\n")
    async for event in event_stream:
        event_count += 1
        print(f"[Event {event_count}] {event}")
        
        # Track error events
        if hasattr(event, 'type') and 'ERROR' in str(event.type):
            error_events.append(event)
    
    print(f"\n{'='*60}")
    print(f"Stream Statistics")
    print(f"{'='*60}")
    print(f"Total events consumed: {event_count}")
    print(f"Error events: {len(error_events)}")
    print(f"Final result captured: {final_result is not None}")
    print(f"{'='*60}\n")
    
    if error_events:
        print(f"Error Events Detected:")
        for err in error_events:
            print(f"  - {err}")
        print()
    
    # Check final result
    if final_result:
        print(f"SUCCESS: on_complete callback was called!")
        print(f"Result output: {final_result.output if hasattr(final_result, 'output') else 'N/A'}")
        return final_result.output if hasattr(final_result, 'output') else str(final_result.data)
    else:
        print(f"FAILURE: on_complete callback was NOT called!")
        return "No output available"


async def main():
    """Run debug tests."""
    
    test_query = "Calculate the factorial of 15"
    
    print("\n" + "=" * 40)
    print("TEST AGUIAdapter Usage")
    result1 = await test_code_execution_with_adapter(test_query)
    print(f"\nTest Result: {result1}")
    

if __name__ == "__main__":
    asyncio.run(main())

