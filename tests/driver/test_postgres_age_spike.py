import pytest

from graphiti_core.driver.postgres_age.spike import PostgresAgeSpike


@pytest.mark.asyncio
async def test_spike_helper_can_be_imported():
    helper = PostgresAgeSpike(dsn='postgresql://graphiti:graphiti@localhost:55432/graphiti')
    assert helper.graph_name == 'graphiti_spike'
