import re
import aiohttp
from typing import Any

from pydantic_ai.messages import ModelMessage, ModelRequest, UserPromptPart
from pydantic_ai.models.google import GoogleModel

from config import logger


class GoogleModelWithAttachments(GoogleModel):
    """Extended Google model with attachment handling."""
    
    async def _fetch_url_bytes(self, url: str) -> bytes | None:
        """Fetch content from URL as bytes."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    if response.status == 200:
                        return await response.read()
                    logger.warning(f"Failed to fetch URL bytes: HTTP {response.status}")
                    return None
        except Exception as e:
            logger.error(f"Error fetching URL: {e}")
            return None
    
    def _parse_attachment_reference(self, text: str) -> list[dict[str, Any]]:
        """Parse [Image: name - url] or [Document: name (type) - url] references."""
        attachments = []
        
        # Pattern for [Image: name - url]
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
                'name': name,
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
        # Remove image references
        text = re.sub(r'\[Image:\s*.+?\s+-\s+https?://[^\]]+?\]', '', text)
        # Remove document references
        text = re.sub(r'\[Document:\s*.+?\s*\([^\)]+?\)\s+-\s+https?://[^\]]+?\]', '', text)
        return text.strip()

    async def _map_messages(self, messages: list[ModelMessage]) -> tuple[Any, list[Any]]:  # type: ignore[override]
        """Map messages with attachment handling."""
        # First, process user messages to convert attachment references
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
                                # Add attachment parts as markers
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
        
        # Call parent's mapping
        return await super()._map_messages(processed_messages)

    async def _map_user_prompt(self, part: UserPromptPart) -> list[dict[str, Any]]:  # type: ignore[override]
        """Handle attachment markers injected during message processing."""
        if isinstance(part.content, str):
            text = part.content
            if text.startswith('__ATTACHMENT__|||'):
                parts = text.split('|||')
                if len(parts) >= 4:
                    att_type = parts[1]
                    media_type = parts[2]
                    url = parts[3]
                    name = parts[4] if len(parts) > 4 else ''

                    data_bytes = await self._fetch_url_bytes(url)
                    if not data_bytes:
                        logger.warning(f"Skipping attachment; failed to fetch bytes: {name}")
                        return []

                    # Map MIME types to Gemini-supported types
                    # Gemini has limited MIME type support
                    gemini_mime_type = media_type
                    
                    # Text-based files should use text/plain
                    text_based_types = {
                        'text/x-sql', 'application/sql', 'application/x-sql',
                        'text/csv', 'application/csv',
                        'text/markdown', 'text/x-markdown',
                        'text/html', 'application/xhtml+xml',
                        'application/json', 'text/json',
                        'application/xml', 'text/xml',
                        'text/javascript', 'application/javascript',
                        'text/css',
                        'application/x-sh', 'text/x-sh',
                        'application/x-python', 'text/x-python',
                    }
                    
                    if media_type in text_based_types or media_type.startswith('text/'):
                        gemini_mime_type = 'text/plain'
                        logger.info(f"Converting {media_type} to text/plain for Gemini compatibility")
                    
                    # Images are supported as-is (image/jpeg, image/png, image/webp, image/gif)
                    # PDFs are supported as application/pdf
                    
                    # For unsupported binary types, try to decode as text
                    if gemini_mime_type not in ['text/plain', 'application/pdf'] and not gemini_mime_type.startswith('image/'):
                        try:
                            # Try to decode as text
                            data_bytes.decode('utf-8')
                            gemini_mime_type = 'text/plain'
                            logger.info(f"Converting {media_type} to text/plain (decodable as UTF-8)")
                        except (UnicodeDecodeError, AttributeError):
                            logger.warning(f"Unsupported MIME type for Gemini: {media_type}. Skipping attachment: {name}")
                            return []

                    # Gemini supports inline bytes for supported media types via inline_data
                    result = [{
                        'inline_data': {
                            'data': data_bytes,
                            'mime_type': gemini_mime_type
                        }
                    }]
                    logger.info(f"Added attachment to Gemini: {name} ({gemini_mime_type}, {len(data_bytes)} bytes)")
                    return result
                # Fallback to text if malformed
                return [{'text': text}]

        # Default behavior for non-marker content
        return await super()._map_user_prompt(part)


