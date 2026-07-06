"""Shared constants for the CLI data migration pipeline.

Centralises table names, field sets, and other values that are referenced
across export, import, diff, and apply modules so that a single change
propagates everywhere.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Canonical table names (9 tables: 4 node + 5 edge)
# ---------------------------------------------------------------------------

NODE_TABLES: list[str] = [
    'entity_nodes',
    'episodic_nodes',
    'community_nodes',
    'saga_nodes',
]

EDGE_TABLES: list[str] = [
    'entity_edges',
    'episodic_edges',
    'community_edges',
    'has_episode_edges',
    'next_episode_edges',
]

# Ordered list: nodes first, then edges.
# Respects FK dependencies (nodes must be processed before edges).
ALL_TABLES: list[str] = list(NODE_TABLES) + list(EDGE_TABLES)

# ---------------------------------------------------------------------------
# Field sets
# ---------------------------------------------------------------------------

# Identity / reference fields that change between groups and must be ignored
# during field comparison and stripped from added/removed records.
IGNORED_FIELDS: frozenset[str] = frozenset({
    'uuid',
    'group_id',
    'source_node_uuid',
    'target_node_uuid',
    'episodes',
    'entity_edges',
    'first_episode_uuid',
    'last_episode_uuid',
    'created_at',
})

# GENERATED columns that must never appear in export output or INSERT statements.
GENERATED_FIELDS: frozenset[str] = frozenset({'search_vector'})

# Embedding fields to compress (applies to any table that has them).
EMBEDDING_FIELDS: frozenset[str] = frozenset({'name_embedding', 'fact_embedding'})

# JOIN-aliased columns added in edge queries for diff purposes only.
# These are NOT part of the actual table schema and must be stripped
# before writing JSONL (otherwise import INSERT fails).
JOIN_ALIAS_FIELDS: frozenset[str] = frozenset({
    'source_name', 'target_name',
    'source_content_hash', 'target_content_hash',
})
