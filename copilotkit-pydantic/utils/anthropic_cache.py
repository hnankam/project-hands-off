"""Temporary workaround to add cache control to Anthropic messages.

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


class AnthropicModelWithCache(AnthropicModel):
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
    
    def _parse_attachment_reference(self, text: str) -> list[dict[str, Any]]:
        """Parse [Image: name - url] or [Document: name (type) - url] references.
        
        Returns list of dicts with 'type', 'url', 'name', 'media_type' keys.
        """
        attachments = []
        
        # Pattern for [Image: name - url]
        # Updated to handle filenames with hyphens by using a more specific pattern
        # Look for " - https" to find the separator before the URL
        image_pattern = r'\[Image:\s*(.+?)\s+-\s+(https?://[^\]]+?)\]'
        for match in re.finditer(image_pattern, text):
            name = match.group(1).strip()
            url = match.group(2).strip()
            # Infer media type from URL or name
            media_type = 'image/png'  # default
            if '.jpg' in url.lower() or '.jpeg' in url.lower():
                media_type = 'image/jpeg'
            elif '.gif' in url.lower():
                media_type = 'image/gif'
            elif '.webp' in url.lower():
                media_type = 'image/webp'
            
            attachments.append({
                'type': 'image',
                'url': url,
                'media_type': media_type
            })
        
        # Pattern for [Document: name (type) - url]
        doc_pattern = r'\[Document:\s*(.+?)\s*\(([^\)]+?)\)\s+-\s+(https?://[^\]]+?)\]'
        for match in re.finditer(doc_pattern, text):
            name = match.group(1).strip()
            media_type = match.group(2).strip()
            url = match.group(3).strip()
            
            attachments.append({
                'type': 'document',
                'url': url,
                'name': name,
                'media_type': media_type
            })
        
        return attachments
    
    def _remove_attachment_references(self, text: str) -> str:
        """Remove [Image: ...] and [Document: ...] references from text."""
        # Remove image references (updated to handle filenames with hyphens)
        text = re.sub(r'\[Image:\s*.+?\s+-\s+https?://[^\]]+?\]', '', text)
        # Remove document references
        text = re.sub(r'\[Document:\s*.+?\s*\([^\)]+?\)\s+-\s+https?://[^\]]+?\]', '', text)
        return text.strip()
    
    async def _map_message(  # type: ignore
        self, messages: list[ModelMessage]
    ) -> tuple[list[TextBlockParam], list[MessageParam]]:
        """Map messages with cache control for system prompts and handle attachments."""
        # First, process user messages to convert attachment references to proper content blocks
        # Only process attachments in the LAST user message to avoid re-processing historical attachments
        processed_messages = []
        
        # Find the index of the last ModelRequest (most recent user message)
        last_request_idx = -1
        for idx, message in enumerate(messages):
            if isinstance(message, ModelRequest):
                last_request_idx = idx
        
        for idx, message in enumerate(messages):
            if isinstance(message, ModelRequest):
                new_parts = []
                is_last_request = (idx == last_request_idx)
                
                for part in message.parts:
                    if isinstance(part, UserPromptPart) and isinstance(part.content, str):
                        # Only process attachments in the most recent user message
                        # For historical messages, remove attachment references without re-processing
                        attachments = self._parse_attachment_reference(part.content)
                        
                        if attachments:
                            # Remove attachment references from text
                            clean_text = self._remove_attachment_references(part.content)
                            
                            # Add clean text part if not empty
                            if clean_text:
                                new_parts.append(UserPromptPart(content=clean_text))
                            
                            # Only process attachments for the most recent message
                            if is_last_request:
                                # Add attachment parts
                                # Note: We'll handle conversion to Anthropic format in the parent's mapping
                                # Store attachments as marker parts that we'll intercept later
                                # Use ||| as delimiter to avoid conflicts with URLs containing colons
                                for attachment in attachments:
                                    marker_text = f"__ATTACHMENT__|||{attachment['type']}|||{attachment.get('media_type', '')}|||{attachment['url']}|||{attachment.get('name', '')}"
                                    new_parts.append(UserPromptPart(content=marker_text))
                                logger.info(f"Processing {len(attachments)} new attachment(s) in latest message")
                            else:
                                # Historical message - attachments already processed, just log
                                logger.debug(f"Skipping {len(attachments)} historical attachment(s) (already processed)")
                        else:
                            new_parts.append(part)
                    else:
                        new_parts.append(part)
                processed_messages.append(ModelRequest(
                    parts=new_parts,
                    instructions=message.instructions
                ))
            else:
                processed_messages.append(message)
        
        # Call parent's mapping with processed messages
        _, anthropic_messages = await super()._map_message(processed_messages)
        
        # Post-process to convert attachment markers to proper Anthropic blocks
        final_messages: list[MessageParam] = []
        for msg in anthropic_messages:
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
                                            logger.info(f"Added image as base64: {name} ({media_type})")
                                        else:
                                            logger.warning(f"Failed to fetch image, skipping: {name}")
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
                    final_messages.append({**msg, 'content': new_content})
                else:
                    final_messages.append(msg)
            else:
                final_messages.append(msg)
        
        # Handle system prompt with cache control
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
        
        return system_prompt, final_messages
    
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

