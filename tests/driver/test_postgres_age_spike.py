import pytest

from graphiti_core.driver.postgres_age.spike import PostgresAgeSpike


@pytest.mark.asyncio
async def test_spike_helper_can_be_imported():
    helper = PostgresAgeSpike(dsn='postgresql://graphiti:graphiti@localhost:55432/graphiti')
    assert helper.graph_name == 'graphiti_spike'


@pytest.mark.asyncio
async def test_connection_before_open_raises():
    helper = PostgresAgeSpike(dsn='postgresql://graphiti:graphiti@localhost:55432/graphiti')

    with pytest.raises(RuntimeError, match='open'):
        async with helper.connection():
            pass


@pytest.mark.asyncio
async def test_execute_cypher_rejects_dollar_quote_breakout_before_connecting():
    helper = PostgresAgeSpike(dsn='postgresql://graphiti:graphiti@localhost:55432/graphiti')

    with pytest.raises(ValueError, match='dollar-quote delimiter'):
        await helper.execute_cypher('RETURN $$', 'uuid agtype')


@pytest.mark.asyncio
async def test_execute_cypher_rejects_non_agtype_columns_before_connecting():
    helper = PostgresAgeSpike(dsn='postgresql://graphiti:graphiti@localhost:55432/graphiti')

    with pytest.raises(ValueError, match='columns'):
        await helper.execute_cypher('RETURN 1', 'uuid text')
