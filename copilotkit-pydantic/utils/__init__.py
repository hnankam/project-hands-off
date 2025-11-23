"""Utility package exports with lazy loading to avoid circular imports."""

__all__ = [
    'AnthropicModelWithAttachments',
    'keep_recent_messages',
    'process_message_attachments',
]


def __getattr__(name):
    if name == 'AnthropicModelWithAttachments':
        from .anthropic_attachments import AnthropicModelWithAttachments  # local import to avoid cycles
        return AnthropicModelWithAttachments
    if name in {'keep_recent_messages', 'process_message_attachments'}:
        from .message_processor import keep_recent_messages, process_message_attachments
        return {
            'keep_recent_messages': keep_recent_messages,
            'process_message_attachments': process_message_attachments,
        }[name]
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

