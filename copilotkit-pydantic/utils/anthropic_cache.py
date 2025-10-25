"""Temporary workaround to add cache control to Anthropic messages.

Reference: https://github.com/pydantic/pydantic-ai/issues/1041
"""

from anthropic.types import (
    MessageParam,
    TextBlockParam,
    ToolParam,
    CacheControlEphemeralParam
)
from pydantic_ai.messages import ModelMessage, ModelRequest, SystemPromptPart
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models import ModelRequestParameters


class AnthropicModelWithCache(AnthropicModel):
    """Extended Anthropic model with cache control support."""
    
    async def _map_message(  # type: ignore
        self, messages: list[ModelMessage]
    ) -> tuple[list[TextBlockParam], list[MessageParam]]:
        """Map messages with cache control for system prompts."""
        _, anthropic_messages = await super()._map_message(messages)
        system_prompt: list[TextBlockParam] = []
        is_cached = False
        
        for message in reversed(messages):
            if isinstance(message, ModelRequest):
                for part in reversed(message.parts):
                    if isinstance(part, SystemPromptPart):
                        if not part.dynamic_ref and not is_cached:
                            block = TextBlockParam(
                                type="text",
                                text=part.content,
                                cache_control={"type": "ephemeral"},
                            )
                            is_cached = True
                        else:
                            block = TextBlockParam(
                                type="text",
                                text=part.content,
                            )
                        system_prompt.append(block)
        
        system_prompt.reverse()

        if instructions := self._get_instructions(messages):
            system_prompt.insert(0, TextBlockParam(type='text', text=instructions))
        
        return system_prompt, anthropic_messages
    
    def _get_tools(
        self, model_request_parameters: ModelRequestParameters
    ) -> list[ToolParam]:
        """Get tools with cache control on the last tool."""
        tools = [
            self._map_tool_definition(r)
            for r in model_request_parameters.function_tools
        ]
        if model_request_parameters.output_tools:
            tools += [
                self._map_tool_definition(r)
                for r in model_request_parameters.output_tools
            ]

        tools[-1]["cache_control"] = CacheControlEphemeralParam(type="ephemeral")
        return tools

