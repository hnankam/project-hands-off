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
    def _safe_int(value: Any) -> int:
        try:
            if isinstance(value, (list, tuple)):
                return int(value[0])
            return int(value)
        except Exception:
            return 0

    async def on_complete_usage_tracking(result: AgentRunResult[Any]):
        """OnCompleteFunc to track token usage and broadcast via WebSocket.
        
        This callback receives AgentRunResult and broadcasts usage information.
        
        Args:
            result: The completed agent run result
        """
        # Get usage information from the result
        usage = result.usage()
        
        # Debug: log the raw usage object
        logger.debug(f"Raw usage object: {usage}")
        # logger.debug(f"Usage type: {type(usage)}")
        # logger.debug(f"Usage attributes: {dir(usage)}")

        # Normalize usage across providers
        req_tokens = 0
        res_tokens = 0
        total_tokens = 0
        
        # Multi-strategy approach to extract tokens from different providers
        # We'll try multiple strategies and use the first one that gives us non-zero values
        
        # Strategy 1: Try direct attributes first (works for Gemini)
        if hasattr(usage, 'input_tokens') and hasattr(usage, 'output_tokens'):
            raw_input = getattr(usage, 'input_tokens', 0)
            raw_output = getattr(usage, 'output_tokens', 0)
            logger.debug(f"Direct attributes - input: {raw_input}, output: {raw_output}")
            
            if raw_input > 0 or raw_output > 0:
                req_tokens = _safe_int(raw_input)
                res_tokens = _safe_int(raw_output)
                total_tokens = req_tokens + res_tokens
                logger.debug(f"✓ Using direct attributes - request: {req_tokens}, response: {res_tokens}, total: {total_tokens}")
        
        # Strategy 2: If still zero, try details dict (works for Anthropic/Claude with cache info)
        if req_tokens == 0 and res_tokens == 0 and isinstance(getattr(usage, 'details', None), dict):
            details = usage.details
            logger.debug(f"Checking details dict: {details}")
            
            # Anthropic/Claude format
            if 'input_tokens' in details and 'output_tokens' in details:
                req_tokens = _safe_int(details.get('input_tokens', 0))
                res_tokens = _safe_int(details.get('output_tokens', 0))
                
                # Add cache tokens for Anthropic (they count towards usage)
                # req_tokens += _safe_int(details.get('cache_creation_input_tokens', 0))
                # req_tokens += _safe_int(details.get('cache_read_input_tokens', 0))
                
                total_tokens = req_tokens + res_tokens
                logger.debug(f"✓ Using details dict (Anthropic) - request: {req_tokens}, response: {res_tokens}, total: {total_tokens}")
            
            # OpenAI format (if different)
            elif 'prompt_tokens' in details and 'completion_tokens' in details:
                req_tokens = _safe_int(details.get('prompt_tokens', 0))
                res_tokens = _safe_int(details.get('completion_tokens', 0))
                total_tokens = _safe_int(details.get('total_tokens', req_tokens + res_tokens))
                logger.debug(f"✓ Using details dict (OpenAI) - request: {req_tokens}, response: {res_tokens}, total: {total_tokens}")
        
        # Strategy 3: Try properties/methods as last resort
        if req_tokens == 0 and res_tokens == 0 and hasattr(usage, 'request_tokens'):
            request_tokens_attr = getattr(usage, 'request_tokens')
            response_tokens_attr = getattr(usage, 'response_tokens')
            total_tokens_attr = getattr(usage, 'total_tokens')
            
            # Check if they are callable (methods) or properties
            if callable(request_tokens_attr):
                req_tokens = _safe_int(request_tokens_attr())
                res_tokens = _safe_int(response_tokens_attr())
                total_tokens = _safe_int(total_tokens_attr())
            else:
                req_tokens = _safe_int(request_tokens_attr)
                res_tokens = _safe_int(response_tokens_attr)
                total_tokens = _safe_int(total_tokens_attr)
            
            if req_tokens > 0 or res_tokens > 0:
                logger.debug(f"✓ Using token properties - request: {req_tokens}, response: {res_tokens}, total: {total_tokens}")
        
        # Final check
        if req_tokens == 0 and res_tokens == 0:
            logger.warning(f"⚠ Could not extract non-zero usage. Usage repr: {repr(usage)}")

        usage_data = {
            "session_id": session_id,
            "agent_type": agent_type,
            "model": model,
            "request_tokens": req_tokens,
            "response_tokens": res_tokens,
            "total_tokens": total_tokens,
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

