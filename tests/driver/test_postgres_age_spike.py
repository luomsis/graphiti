from uuid import uuid4

import pytest

from graphiti_core.driver.postgres_age.spike import PostgresAgeSpike

DSN = 'postgresql://graphiti:graphiti@localhost:55432/graphiti'


@pytest.mark.asyncio
async def test_spike_helper_can_be_imported():
    helper = PostgresAgeSpike(dsn=DSN)
    assert helper.graph_name == 'graphiti_spike'


@pytest.mark.asyncio
async def test_connection_before_open_raises():
    helper = PostgresAgeSpike(dsn=DSN)

    with pytest.raises(RuntimeError, match='open'):
        async with helper.connection():
            pass


@pytest.mark.asyncio
async def test_execute_cypher_rejects_dollar_quote_breakout_before_connecting():
    helper = PostgresAgeSpike(dsn=DSN)

    with pytest.raises(ValueError, match='dollar-quote delimiter'):
        await helper.execute_cypher('RETURN $$', 'uuid agtype')


@pytest.mark.asyncio
async def test_execute_cypher_rejects_non_agtype_columns_before_connecting():
    helper = PostgresAgeSpike(dsn=DSN)

    with pytest.raises(ValueError, match='columns'):
        await helper.execute_cypher('RETURN 1', 'uuid text')


async def _drop_spike_objects(helper: PostgresAgeSpike) -> None:
    if helper.pool is None:
        raise RuntimeError('helper must be open before cleanup')

    async with helper.pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute('CREATE EXTENSION IF NOT EXISTS age')
            await cur.execute("LOAD 'age'")
            await cur.execute('SET search_path = ag_catalog, "$user", public')
            await cur.execute('SELECT 1 FROM ag_catalog.ag_graph WHERE name = %s', (helper.graph_name,))
            if await cur.fetchone() is not None:
                await cur.execute('SELECT drop_graph(%s, true)', (helper.graph_name,))
            await cur.execute('DROP TABLE IF EXISTS public.spike_entity_edges')
            await cur.execute('DROP TABLE IF EXISTS public.spike_entity_nodes')
        await conn.commit()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_bootstrap_creates_extensions_schema_and_graph():
    helper = PostgresAgeSpike(dsn=DSN, graph_name=f'graphiti_spike_{uuid4().hex}')
    await helper.open()
    try:
        await _drop_spike_objects(helper)
        await helper.bootstrap()

        async with helper.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                SELECT extname
                FROM pg_extension
                WHERE extname = ANY(%s)
                """,
                (['age', 'pg_trgm', 'vector'],),
            )
            extensions = {row[0] for row in await cur.fetchall()}

            await cur.execute(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                  AND tablename = ANY(%s)
                """,
                (['spike_entity_edges', 'spike_entity_nodes'],),
            )
            tables = {row[0] for row in await cur.fetchall()}

            await cur.execute(
                'SELECT name FROM ag_catalog.ag_graph WHERE name = %s',
                (helper.graph_name,),
            )
            graph_name = await cur.fetchone()
    finally:
        try:
            await _drop_spike_objects(helper)
        finally:
            await helper.close()

    assert extensions == {'age', 'pg_trgm', 'vector'}
    assert tables == {'spike_entity_edges', 'spike_entity_nodes'}
    assert graph_name == (helper.graph_name,)
