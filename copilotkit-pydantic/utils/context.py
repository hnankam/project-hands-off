"""Utility helpers for multi-tenant context keys."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

GLOBAL_SENTINEL = "__global__"


@dataclass(frozen=True)
class ContextKey:
    """Normalized key representing an organization/team scope."""

    organization_id: Optional[str]
    team_id: Optional[str]

    @property
    def tuple(self) -> Tuple[str, str]:
        """Return the normalized tuple representation used for dict keys."""

        return (
            self.organization_id or GLOBAL_SENTINEL,
            self.team_id or GLOBAL_SENTINEL,
        )

    def __iter__(self):
        yield self.organization_id
        yield self.team_id


def make_context_key(organization_id: Optional[str], team_id: Optional[str]) -> ContextKey:
    """Create a :class:`ContextKey` helper."""

    return ContextKey(
        organization_id=organization_id or None,
        team_id=team_id or None,
    )


def context_tuple(organization_id: Optional[str], team_id: Optional[str]) -> Tuple[str, str]:
    """Convenience helper returning the normalized tuple key."""

    return make_context_key(organization_id, team_id).tuple


def is_global_context(context: ContextKey | Tuple[str, str]) -> bool:
    """Check if the context represents the global (unscoped) configuration."""

    if isinstance(context, ContextKey):
        org_id, team_id = context.tuple
    else:
        org_id, team_id = context
    return org_id == GLOBAL_SENTINEL and team_id == GLOBAL_SENTINEL


