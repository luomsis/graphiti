from uuid import uuid4

import pytest


@pytest.mark.integration
async def test_execute_query_returns_neo4j_like_tuple(postgres_age_driver):
    records, summary, keys = await postgres_age_driver.execute_query(
        'SELECT %s::text AS value',
        params=('ok',),
    )

    assert records == [{'value': 'ok'}]
    assert summary is None
    assert keys == ['value']


@pytest.mark.integration
async def test_transaction_rolls_back_on_error(postgres_age_driver):
    table_name = f'graphiti_tx_probe_{uuid4().hex}'
    await postgres_age_driver.execute_query(f'CREATE TABLE {table_name} (value text)')

    try:
        with pytest.raises(RuntimeError):
            async with postgres_age_driver.transaction() as tx:
                await tx.run(f'INSERT INTO {table_name} (value) VALUES (%s)', ('rolled-back',))
                raise RuntimeError('force rollback')

        records, _, _ = await postgres_age_driver.execute_query(f'SELECT value FROM {table_name}')
        assert records == []
    finally:
        await postgres_age_driver.execute_query(f'DROP TABLE IF EXISTS {table_name}')


@pytest.mark.integration
async def test_session_execute_write_runs_callback(postgres_age_driver):
    async with postgres_age_driver.session() as session:
        result = await session.execute_write(
            lambda tx: tx.run('SELECT %s::text AS value', ('written',))
        )

    assert result[0][0]['value'] == 'written'
