from contextlib import suppress

import pytest

from graphiti_core.driver.postgres_age import PostgresAgeDriver

EXPECTED_TABLES = {
    'entity_nodes',
    'episodic_nodes',
    'community_nodes',
    'saga_nodes',
    'entity_edges',
    'episodic_edges',
    'community_edges',
    'has_episode_edges',
    'next_episode_edges',
}


@pytest.mark.integration
async def test_build_indices_creates_extensions_tables_and_age_graph(postgres_age_driver):
    await postgres_age_driver.build_indices_and_constraints(delete_existing=True)

    records, _, _ = await postgres_age_driver.execute_query(
        """
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename = ANY(%s)
        """,
        params=(sorted(EXPECTED_TABLES),),
    )
    assert {row['tablename'] for row in records} == EXPECTED_TABLES

    records, _, _ = await postgres_age_driver.execute_query(
        """
        SELECT extname
        FROM pg_extension
        WHERE extname = ANY(%s)
        """,
        params=(['age', 'vector', 'pg_trgm'],),
    )
    assert {row['extname'] for row in records} == {'age', 'vector', 'pg_trgm'}

    records, _, _ = await postgres_age_driver.execute_query(
        'SELECT name FROM ag_catalog.ag_graph WHERE name = %s',
        params=(postgres_age_driver.graph_name,),
    )
    assert records == [{'name': postgres_age_driver.graph_name}]


@pytest.mark.integration
async def test_build_indices_creates_expected_vector_dimensions(postgres_age_driver):
    await postgres_age_driver.build_indices_and_constraints(delete_existing=True)

    records, _, _ = await postgres_age_driver.execute_query(
        """
        SELECT table_name, column_name, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY(%s)
          AND column_name = ANY(%s)
        ORDER BY table_name, column_name
        """,
        params=(
            ['community_nodes', 'entity_edges', 'entity_nodes'],
            ['fact_embedding', 'name_embedding'],
        ),
    )

    assert records == [
        {'table_name': 'community_nodes', 'column_name': 'name_embedding', 'udt_name': 'vector'},
        {'table_name': 'entity_edges', 'column_name': 'fact_embedding', 'udt_name': 'vector'},
        {'table_name': 'entity_nodes', 'column_name': 'name_embedding', 'udt_name': 'vector'},
    ]

    records, _, _ = await postgres_age_driver.execute_query(
        """
        SELECT atttypmod
        FROM pg_attribute
        WHERE attrelid = 'public.entity_nodes'::regclass
          AND attname = 'name_embedding'
        """
    )
    assert records == [{'atttypmod': postgres_age_driver.embedding_dimension}]


@pytest.mark.integration
async def test_delete_existing_replaces_stale_tables_and_graph(postgres_age_driver):
    await postgres_age_driver.build_indices_and_constraints(delete_existing=True)
    await postgres_age_driver.execute_query(
        "INSERT INTO entity_nodes (uuid, group_id, name, created_at) VALUES ('stale', 'g', 'n', now())"
    )
    await postgres_age_driver.execute_query(
        "SELECT * FROM cypher('graphiti_test_core', $$CREATE (:Entity {uuid: 'stale'})$$) AS (v agtype)"
    )

    await postgres_age_driver.build_indices_and_constraints(delete_existing=True)

    records, _, _ = await postgres_age_driver.execute_query('SELECT uuid FROM entity_nodes')
    assert records == []

    records, _, _ = await postgres_age_driver.execute_query(
        'SELECT name FROM ag_catalog.ag_graph WHERE name = %s',
        params=(postgres_age_driver.graph_name,),
    )
    assert records == [{'name': postgres_age_driver.graph_name}]


@pytest.mark.integration
async def test_build_indices_honors_custom_schema(postgres_age_dsn):
    driver = PostgresAgeDriver(
        dsn=postgres_age_dsn,
        graph_name='graphiti_schema_test_graph',
        schema='graphiti_schema_test',
        embedding_dimension=384,
    )
    try:
        await driver.build_indices_and_constraints(delete_existing=True)
        records, _, _ = await driver.execute_query(
            """
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = %s
              AND tablename = ANY(%s)
            """,
            params=('graphiti_schema_test', sorted(EXPECTED_TABLES)),
        )

        assert {row['tablename'] for row in records} == EXPECTED_TABLES
    finally:
        with suppress(Exception):
            await driver.delete_all_indexes()
            await driver.execute_query('DROP SCHEMA IF EXISTS graphiti_schema_test CASCADE')
        await driver.close()
