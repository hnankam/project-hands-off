"""Usage tracking and reporting for agent runs."""

from typing import Any, Callable, Awaitable
from pydantic_ai.run import AgentRunResult

from config import logger


def create_usage_tracking_callback(
    session_id: str,
    agent_type: str,
    model: str,
    broadcast_func: Callable[[str, dict], Awaitable[None]]
):
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
        
        Args:
            result: The completed agent run result
        """
        # Get usage information from the result
        usage = result.usage()

        print(f"Usage: {usage}")

        _usage = {}

        if 'gemini' in model:
            # Usage: RunUsage(input_tokens=3819, cache_read_tokens=3699, output_tokens=42, 
            # details={'cached_content_tokens': 3699, 'thoughts_tokens': 26, 'text_prompt_tokens': 3819, 
            # 'text_cache_tokens': 3699}, requests=1)
            _usage['request_tokens'] = usage.input_tokens
            _usage['response_tokens'] = usage.output_tokens
            _usage['total_tokens'] = usage.input_tokens + usage.output_tokens
            _usage['cached_content_tokens'] = usage.details.get('cached_content_tokens', 0)
            _usage['thoughts_tokens'] = usage.details.get('thoughts_tokens', 0)
            _usage['text_prompt_tokens'] = usage.details.get('text_prompt_tokens', 0) 
            _usage['text_cache_tokens'] = usage.details.get('text_cache_tokens', 0)

        if 'claude' in model:
            # Usage: RunUsage(details={'cache_creation_input_tokens': 4339, 'cache_read_input_tokens': 0, 
            # 'input_tokens': 440, 'output_tokens': 18}, requests=1)
            _usage['request_tokens'] = usage.details.get('input_tokens', 0)
            _usage['response_tokens'] = usage.details.get('output_tokens', 0)
            _usage['total_tokens'] = usage.details.get('input_tokens', 0) + usage.details.get('output_tokens', 0)
            _usage['cached_content_tokens'] = usage.details.get('cache_creation_input_tokens', 0)
            _usage['cached_read_tokens'] = usage.details.get('cache_read_input_tokens', 0)
        
        if 'gpt' in model:
            # Usage: RunUsage(input_tokens=3024, cache_read_tokens=2816, output_tokens=197, details={'accepted_prediction_tokens': 0, 'audio_tokens': 0, 'reasoning_tokens': 128, 'rejected_prediction_tokens': 0}, requests=1)
            _usage['request_tokens'] = usage.input_tokens
            _usage['response_tokens'] = usage.output_tokens
            _usage['total_tokens'] = usage.input_tokens + usage.output_tokens
            _usage['cached_content_tokens'] = usage.cache_read_tokens
            _usage['thoughts_tokens'] = usage.details.get('reasoning_tokens', 0)

        usage_data = {
            "session_id": session_id,
            "agent_type": agent_type,
            "model": model,
            "request_tokens": _usage['request_tokens'][0] if isinstance(_usage['request_tokens'], tuple) else _usage['request_tokens'],
            "response_tokens": _usage['response_tokens'][0] if isinstance(_usage['response_tokens'], tuple) else _usage['response_tokens'],
            "total_tokens": _usage['total_tokens'][0] if isinstance(_usage['total_tokens'], tuple) else _usage['total_tokens'],
            "timestamp": None,  # Will be set by broadcast function
        }
        
        logger.info(
            f"usage session={session_id} agent={agent_type} model={model} "
            f"req={usage_data['request_tokens']} res={usage_data['response_tokens']} "
            f"total={usage_data['total_tokens']}"
        )
        
        # Broadcast usage to connected WebSocket clients by session
        await broadcast_func(session_id, usage_data)
    
    return on_complete_usage_tracking

