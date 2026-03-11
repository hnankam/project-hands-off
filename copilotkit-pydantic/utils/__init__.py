"""Utility package exports with lazy loading to avoid circular imports."""

__all__ = [
    'sanitize_tool_message_alignment',
]


def __getattr__(name):
    if name == 'sanitize_tool_message_alignment':
        from .message_processor import sanitize_tool_message_alignment
        return sanitize_tool_message_alignment
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

