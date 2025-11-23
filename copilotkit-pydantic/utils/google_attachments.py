import re
import aiohttp
from typing import Any

from pydantic_ai.messages import ModelMessage, ModelRequest, UserPromptPart
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models import ModelRequestParameters

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


