"""Temporary workaround to add message attachments to Anthropic messages.

Reference: https://github.com/pydantic/pydantic-ai/issues/1041
"""

import re
import base64
import aiohttp
from typing import Any
from anthropic.types import (
    MessageParam,
    TextBlockParam,
    ImageBlockParam,
    DocumentBlockParam,
    ToolParam,
    CacheControlEphemeralParam,
)
from pydantic_ai.messages import ModelMessage, ModelRequest, SystemPromptPart, UserPromptPart
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models import ModelRequestParameters

from config import logger


class AnthropicModelWithAttachments(AnthropicModel):
    """Extended Anthropic model with cache control support and attachment handling."""
    
    async def _fetch_url_as_base64(self, url: str) -> str | None:
        """Fetch content from URL and convert to base64.
        
        Required for Bedrock as it doesn't support URL sources, only base64.
        See: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html
        
        Args:
            url: The URL to fetch
            
        Returns:
            Base64-encoded content or None if fetch fails
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    if response.status == 200:
                        content = await response.read()
                        base64_data = base64.b64encode(content).decode('utf-8')
                        logger.info(f"Fetched and encoded {len(content)} bytes from URL (base64 length: {len(base64_data)})")
                        return base64_data
                    else:
                        logger.warning(f"Failed to fetch URL: HTTP {response.status}")
                        return None
        except Exception as e:
            logger.error(f"Error fetching URL: {e}")
            return None
    
    async def _map_message(  # type: ignore
        self,
        messages: list[ModelMessage],
        model_request_parameters: ModelRequestParameters,
        agent_model_function_tools: Any | None = None,
    ) -> tuple[str, list[MessageParam]]:
        """Map messages with cache control for system prompts and handle attachments."""
        
        # Call parent's mapping with messages (assuming they are pre-processed by message_processor)
        system_prompt_str, anthropic_messages = await super()._map_message(
            messages, model_request_parameters, agent_model_function_tools
        )
        
        # Post-process to convert attachment markers to proper Anthropic blocks
        final_messages: list[MessageParam] = []
        for idx, msg in enumerate(anthropic_messages):
            if msg.get('role') == 'user':
                content = msg.get('content', [])
                if isinstance(content, list):
                    new_content: list[Any] = []
                    for block in content:
                        if isinstance(block, dict) and block.get('type') == 'text':
                            text = block.get('text', '')
                            if text.startswith('__ATTACHMENT__|||'):
                                # Parse attachment marker (using ||| delimiter to avoid URL colon conflicts)
                                parts = text.split('|||')
                                if len(parts) >= 4:
                                    att_type = parts[1]
                                    media_type = parts[2]
                                    url = parts[3]
                                    name = parts[4] if len(parts) > 4 else ''
                                    
                                    if att_type == 'image':
                                        # Fetch image and convert to base64 (required by Bedrock)
                                        logger.info(f"Fetching image from URL: {url[:80]}...")
                                        base64_data = await self._fetch_url_as_base64(url)
                                        if base64_data:
                                            new_content.append(ImageBlockParam(
                                                type='image',
                                                source={
                                                    'type': 'base64',
                                                    'media_type': media_type,
                                                    'data': base64_data
                                                }
                                            ))
                                            logger.info(f"✓ Added image as base64: {name} ({media_type}), size: {len(base64_data)} chars")
                                        else:
                                            logger.warning(f"✗ Failed to fetch image, skipping: {name}")
                                    elif att_type == 'document':
                                        # Fetch document and convert to base64 (required by Bedrock)
                                        base64_data = await self._fetch_url_as_base64(url)
                                        if base64_data:
                                            # Infer document format from media_type
                                            format_map = {
                                                'application/pdf': 'pdf',
                                                'text/html': 'html',
                                                'text/markdown': 'md',
                                                'application/msword': 'doc',
                                                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                                                'application/vnd.ms-excel': 'xls',
                                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
                                                'text/csv': 'csv',
                                                'text/plain': 'txt',
                                            }
                                            doc_format = format_map.get(media_type, 'txt')
                                            
                                            # PDFs must use base64 source with media_type application/pdf
                                            if doc_format == 'pdf':
                                                new_content.append(DocumentBlockParam(
                                                    type='document',
                                                    source={
                                                        'type': 'base64',
                                                        'media_type': 'application/pdf',
                                                        'data': base64_data
                                                    },
                                                    title=name
                                                ))
                                            # Text-like docs (csv, txt, md, html) should use PlainTextSourceParam
                                            elif doc_format in {'csv', 'txt', 'md', 'html'}:
                                                try:
                                                    text_data = base64.b64decode(base64_data).decode('utf-8', errors='replace')
                                                except Exception:
                                                    text_data = ''
                                                new_content.append(DocumentBlockParam(
                                                    type='document',
                                                    source={
                                                        'type': 'text',
                                                        'media_type': 'text/plain',
                                                        'data': text_data
                                                    },
                                                    title=name
                                                ))
                                            else:
                                                # Fallback: treat as text if we can decode, otherwise skip
                                                try:
                                                    text_data = base64.b64decode(base64_data).decode('utf-8', errors='replace')
                                                except Exception:
                                                    text_data = ''
                                                if text_data:
                                                    new_content.append(DocumentBlockParam(
                                                        type='document',
                                                        source={
                                                            'type': 'text',
                                                            'media_type': 'text/plain',
                                                            'data': text_data
                                                        },
                                                        title=name
                                                    ))
                                                else:
                                                    logger.warning(f"Unsupported document format for Bedrock mapping; skipping: {name} ({media_type})")
                                            logger.info(f"Added document: {name} (format: {doc_format})")
                                        else:
                                            logger.warning(f"Failed to fetch document, skipping: {name}")
                            else:
                                new_content.append(block)
                        else:
                            new_content.append(block)
                    final_msg = {**msg, 'content': new_content}
                    final_messages.append(final_msg)
                else:
                    final_messages.append(msg)
            else:
                final_messages.append(msg)
        
        return system_prompt_str, final_messages
    
    def _get_tools(
        self, 
        model_request_parameters: ModelRequestParameters,
        agent_model_function_tools: Any = None
    ) -> list[ToolParam]:
        """Get tools with cache control on the last tool."""
        # Call parent's _get_tools with all arguments
        tools = super()._get_tools(model_request_parameters, agent_model_function_tools)
        
        # Add cache control to the last tool with TTL
        if tools:
            try:
                tools[-1]["cache_control"] = CacheControlEphemeralParam(type="ephemeral")
            except TypeError:
                # Fallback without ttl parameter (older API)
                tools[-1]["cache_control"] = CacheControlEphemeralParam(type="ephemeral")
        
        return tools

