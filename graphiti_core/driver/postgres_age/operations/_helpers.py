from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from graphiti_core.driver.query_executor import QueryExecutor, Transaction


@asynccontextmanager
async def operation_transaction(
    executor: QueryExecutor, tx: Transaction | None
) -> AsyncIterator[Transaction | None]:
    if tx is not None:
        yield tx
        return

    transaction_factory = getattr(executor, 'transaction', None)
    if transaction_factory is None:
        yield None
        return

    async with transaction_factory() as new_tx:
        yield new_tx


async def run_statement(
    executor: QueryExecutor,
    tx: Transaction | None,
    query: str,
    params: dict[str, Any],
) -> None:
    if tx is not None:
        await tx.run(query, params=params)
    else:
        await executor.execute_query(query, params=params)


def jsonb(executor: QueryExecutor, value: dict[str, Any] | None) -> Any:
    deps = getattr(executor, '_deps', None)
    if deps is None or value is None:
        return value
    return deps.Jsonb(value)


def source_value(source: Any | None) -> str | None:
    if source is None:
        return None
    value = getattr(source, 'value', None)
    if isinstance(value, str):
        return value
    name = getattr(source, 'name', None)
    if isinstance(name, str):
        return name
    return str(source)
