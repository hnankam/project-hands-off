"""Utility package exports with lazy loading to avoid circular imports."""

__all__ = [
    'keep_recent_messages',
]


def __getattr__(name):
    if name == 'keep_recent_messages':
        from .message_processor import keep_recent_messages
        return keep_recent_messages
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

