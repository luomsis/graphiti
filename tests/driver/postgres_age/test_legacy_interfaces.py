from datetime import datetime, timezone

import pytest

from graphiti_core.edges import CommunityEdge, EntityEdge, EpisodicEdge
from graphiti_core.errors import EdgeNotFoundError, NodeNotFoundError
from graphiti_core.nodes import CommunityNode, EntityNode, EpisodeType, EpisodicNode, SagaNode
from graphiti_core.search.search_filters import SearchFilters
from graphiti_core.search.search_utils import (
    episode_mentions_reranker,
    node_distance_reranker,
    node_fulltext_search,
)
from graphiti_core.utils.bulk_utils import add_nodes_and_edges_bulk

CREATED_AT = datetime(2026, 5, 26, 10, 0, tzinfo=timezone.utc)
VALID_AT = datetime(2026, 5, 26, 9, 0, tzinfo=timezone.utc)


@pytest.mark.integration
async def test_postgres_age_legacy_interfaces_route_high_level_helpers(postgres_age_driver):
    await postgres_age_driver.build_indices_and_constraints(delete_existing=True)

    alice = EntityNode(
        uuid='legacy-alice',
        name='Alice',
        group_id='legacy',
        labels=['Person'],
        summary='Graph database engineer',
        name_embedding=[1.0] + [0.0] * 383,
        created_at=CREATED_AT,
    )
    bob = EntityNode(
        uuid='legacy-bob',
        name='Bob',
        group_id='legacy',
        labels=['Person'],
        summary='Product manager',
        name_embedding=[0.0, 1.0] + [0.0] * 382,
        created_at=CREATED_AT,
    )
    episode = EpisodicNode(
        uuid='legacy-episode',
        name='Graph episode',
        group_id='legacy',
        source=EpisodeType.message,
        source_description='chat',
        content='Alice discussed the graph database migration',
        valid_at=VALID_AT,
        created_at=CREATED_AT,
    )
    edge = EntityEdge(
        uuid='legacy-edge',
        group_id='legacy',
        source_node_uuid='legacy-alice',
        target_node_uuid='legacy-bob',
        name='COLLABORATES_WITH',
        fact='Alice collaborates with Bob on graph database work',
        fact_embedding=[1.0] + [0.0] * 383,
        valid_at=VALID_AT,
        created_at=CREATED_AT,
    )

    await alice.save(postgres_age_driver)
    await bob.save(postgres_age_driver)
    await episode.save(postgres_age_driver)
    await edge.save(postgres_age_driver)
    await postgres_age_driver.episodic_edge_ops.save(
        postgres_age_driver,
        EpisodicEdge(
            uuid='legacy-mention',
            group_id='legacy',
            source_node_uuid='legacy-episode',
            target_node_uuid='legacy-alice',
            created_at=CREATED_AT,
        ),
    )

    loaded = await EntityNode.get_by_uuid(postgres_age_driver, 'legacy-alice')
    searched = await node_fulltext_search(
        postgres_age_driver,
        'graph database',
        SearchFilters(),
        group_ids=['legacy'],
        limit=5,
    )
    distance_uuids, distance_scores = await node_distance_reranker(
        postgres_age_driver,
        ['legacy-bob', 'legacy-alice'],
        center_node_uuid='legacy-alice',
        min_score=0,
    )
    mention_uuids, mention_scores = await episode_mentions_reranker(
        postgres_age_driver,
        [['legacy-bob', 'legacy-alice']],
        min_score=0,
    )

    assert postgres_age_driver.graph_operations_interface is not None
    assert postgres_age_driver.search_interface is not None
    assert loaded.uuid == 'legacy-alice'
    assert [node.uuid for node in searched] == ['legacy-alice']
    assert distance_uuids == ['legacy-alice', 'legacy-bob']
    assert distance_scores == [10.0, 1.0]
    assert mention_uuids == ['legacy-alice', 'legacy-bob']
    assert mention_scores == [1, 0]


@pytest.mark.integration
async def test_postgres_age_legacy_interfaces_dispatch_base_deletes(postgres_age_driver):
    await postgres_age_driver.build_indices_and_constraints(delete_existing=True)

    entity = EntityNode(
        uuid='delete-entity',
        name='Entity',
        group_id='legacy-delete',
        labels=['Person'],
        created_at=CREATED_AT,
    )
    episode = EpisodicNode(
        uuid='delete-episode',
        name='Episode',
        group_id='legacy-delete',
        source=EpisodeType.message,
        source_description='chat',
        content='Entity was mentioned',
        valid_at=VALID_AT,
        created_at=CREATED_AT,
    )
    community = CommunityNode(
        uuid='delete-community',
        name='Community',
        group_id='legacy-delete',
        created_at=CREATED_AT,
    )
    episodic_edge = EpisodicEdge(
        uuid='delete-mention',
        group_id='legacy-delete',
        source_node_uuid='delete-episode',
        target_node_uuid='delete-entity',
        created_at=CREATED_AT,
    )
    community_edge = CommunityEdge(
        uuid='delete-member',
        group_id='legacy-delete',
        source_node_uuid='delete-community',
        target_node_uuid='delete-entity',
        created_at=CREATED_AT,
    )

    await entity.save(postgres_age_driver)
    await episode.save(postgres_age_driver)
    await community.save(postgres_age_driver)
    await episodic_edge.save(postgres_age_driver)
    await community_edge.save(postgres_age_driver)

    await episodic_edge.delete(postgres_age_driver)
    await community_edge.delete(postgres_age_driver)
    await episode.delete(postgres_age_driver)
    await community.delete(postgres_age_driver)

    with pytest.raises(EdgeNotFoundError):
        await EpisodicEdge.get_by_uuid(postgres_age_driver, 'delete-mention')
    with pytest.raises(EdgeNotFoundError):
        await CommunityEdge.get_by_uuid(postgres_age_driver, 'delete-member')
    with pytest.raises(NodeNotFoundError):
        await EpisodicNode.get_by_uuid(postgres_age_driver, 'delete-episode')
    with pytest.raises(NodeNotFoundError):
        await CommunityNode.get_by_uuid(postgres_age_driver, 'delete-community')


@pytest.mark.integration
async def test_postgres_age_legacy_interface_dispatches_direct_saga_node_delete(
    postgres_age_driver,
):
    await postgres_age_driver.build_indices_and_constraints(delete_existing=True)

    saga = SagaNode(
        uuid='delete-saga',
        name='Saga',
        group_id='legacy-delete',
        created_at=CREATED_AT,
    )

    await saga.save(postgres_age_driver)
    await postgres_age_driver.graph_operations_interface.node_delete(saga, postgres_age_driver)

    with pytest.raises(NodeNotFoundError):
        await SagaNode.get_by_uuid(postgres_age_driver, 'delete-saga')


@pytest.mark.integration
async def test_postgres_age_legacy_interfaces_support_bulk_utility(
    postgres_age_driver,
    mock_embedder,
):
    await postgres_age_driver.build_indices_and_constraints(delete_existing=True)

    episode = EpisodicNode(
        uuid='bulk-episode',
        name='Bulk episode',
        group_id='legacy-bulk',
        source=EpisodeType.message,
        source_description='chat',
        content='Alice mentioned Bob',
        valid_at=VALID_AT,
        created_at=CREATED_AT,
    )
    alice = EntityNode(
        uuid='bulk-alice',
        name='Alice',
        group_id='legacy-bulk',
        labels=['Person'],
        summary='Engineer',
        created_at=CREATED_AT,
    )
    bob = EntityNode(
        uuid='bulk-bob',
        name='Bob',
        group_id='legacy-bulk',
        labels=['Person'],
        summary='Manager',
        created_at=CREATED_AT,
    )
    episodic_edge = EpisodicEdge(
        uuid='bulk-mention',
        group_id='legacy-bulk',
        source_node_uuid='bulk-episode',
        target_node_uuid='bulk-alice',
        created_at=CREATED_AT,
    )
    entity_edge = EntityEdge(
        uuid='bulk-edge',
        group_id='legacy-bulk',
        source_node_uuid='bulk-alice',
        target_node_uuid='bulk-bob',
        name='KNOWS',
        fact='Alice knows Bob',
        created_at=CREATED_AT,
        episodes=['bulk-episode'],
    )

    await add_nodes_and_edges_bulk(
        postgres_age_driver,
        [episode],
        [episodic_edge],
        [alice, bob],
        [entity_edge],
        mock_embedder,
    )

    loaded_nodes = await EntityNode.get_by_uuids(postgres_age_driver, ['bulk-alice', 'bulk-bob'])
    loaded_edge = await EntityEdge.get_by_uuid(postgres_age_driver, 'bulk-edge')
    loaded_episode = await EpisodicNode.get_by_uuid(postgres_age_driver, 'bulk-episode')
    loaded_mention = await EpisodicEdge.get_by_uuid(postgres_age_driver, 'bulk-mention')

    assert {node.uuid for node in loaded_nodes} == {'bulk-alice', 'bulk-bob'}
    assert loaded_edge.source_node_uuid == 'bulk-alice'
    assert loaded_edge.fact_embedding is not None
    assert loaded_episode.uuid == 'bulk-episode'
    assert loaded_mention.target_node_uuid == 'bulk-alice'
