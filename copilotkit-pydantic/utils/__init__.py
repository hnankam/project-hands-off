"""Utility package exports with lazy loading to avoid circular imports."""

__all__ = [
    'AnthropicModelWithCache',
    'keep_recent_messages',
    'process_message_attachments',
]


def __getattr__(name):
    if name == 'AnthropicModelWithCache':
        from .anthropic_cache import AnthropicModelWithCache  # local import to avoid cycles
        return AnthropicModelWithCache
    if name in {'keep_recent_messages', 'process_message_attachments'}:
        from .message_processor import keep_recent_messages, process_message_attachments
        return {
            'keep_recent_messages': keep_recent_messages,
            'process_message_attachments': process_message_attachments,
        }[name]
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

