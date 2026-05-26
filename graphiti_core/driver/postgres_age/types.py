from __future__ import annotations

CANONICAL_TABLES: tuple[str, ...] = (
    'next_episode_edges',
    'has_episode_edges',
    'community_edges',
    'episodic_edges',
    'entity_edges',
    'saga_nodes',
    'community_nodes',
    'episodic_nodes',
    'entity_nodes',
)

NODE_TABLES: tuple[str, ...] = (
    'entity_nodes',
    'episodic_nodes',
    'community_nodes',
    'saga_nodes',
)

EDGE_TABLES: tuple[str, ...] = (
    'entity_edges',
    'episodic_edges',
    'community_edges',
    'has_episode_edges',
    'next_episode_edges',
)
