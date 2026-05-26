from __future__ import annotations

import inspect
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from typing import Any

from graphiti_core.driver.driver import GraphDriver, GraphDriverSession, GraphProvider
from graphiti_core.driver.postgres_age.deps import import_postgres_age_dependencies
from graphiti_core.driver.query_executor import Transaction

PostgresAgeResult = tuple[list[dict[str, Any]], None, list[str]]


class PostgresAgeDriver(GraphDriver):
    provider = GraphProvider.POSTGRES_AGE
    default_group_id = ''

    def __init__(
        self,
        dsn: str,
        graph_name: str = 'graphiti',
        schema: str = 'public',
        embedding_dimension: int = 1536,
        pool_min_size: int = 1,
        pool_max_size: int = 10,
    ) -> None:
        self.dsn = dsn
        self.graph_name = graph_name
        self.schema = schema
        self.embedding_dimension = embedding_dimension
        self._database = graph_name
        self._deps = import_postgres_age_dependencies()
        self._pool = self._deps.AsyncConnectionPool(
            conninfo=dsn,
            min_size=pool_min_size,
            max_size=pool_max_size,
            open=False,
            kwargs={'row_factory': self._deps.dict_row},
        )
        self._pool_opened = False

    async def _ensure_open(self) -> None:
        if self._pool_opened:
            return

        await self._pool.open()
        self._pool_opened = True

    async def _setup_connection(self, conn: Any) -> None:
        await self._deps.register_vector_async(conn)
        await conn.execute("LOAD 'age'")
        await conn.execute('SET search_path = ag_catalog, "$user", public')

    async def execute_query(self, cypher_query_: str, **kwargs: Any) -> PostgresAgeResult:
        await self._ensure_open()
        params = _query_params(kwargs.pop('params', None), kwargs)

        async with self._pool.connection() as conn:
            try:
                await self._setup_connection(conn)
                result = await _run_sql(conn, cypher_query_, params)
                await conn.commit()
                return result
            except Exception:
                await conn.rollback()
                raise

    def session(self, database: str | None = None) -> GraphDriverSession:
        return PostgresAgeDriverSession(self)

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[Transaction]:
        await self._ensure_open()
        async with self._pool.connection() as conn:
            await self._setup_connection(conn)
            await conn.commit()
            async with conn.transaction():
                yield PostgresAgeTransaction(conn)

    async def close(self) -> None:
        if not self._pool_opened:
            return

        await self._pool.close()
        self._pool_opened = False

    async def delete_all_indexes(self) -> None:
        raise NotImplementedError()

    async def build_indices_and_constraints(self, delete_existing: bool = False) -> None:
        raise NotImplementedError()


class PostgresAgeTransaction(Transaction):
    def __init__(self, conn: Any) -> None:
        self._conn = conn

    async def run(
        self, query: str, params: Sequence[Any] | dict[str, Any] | None = None, **kwargs: Any
    ) -> PostgresAgeResult:
        return await _run_sql(self._conn, query, _query_params(params, kwargs))


class PostgresAgeDriverSession(GraphDriverSession):
    provider = GraphProvider.POSTGRES_AGE

    def __init__(self, driver: PostgresAgeDriver) -> None:
        self._driver = driver

    async def __aenter__(self) -> PostgresAgeDriverSession:
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        await self.close()

    async def run(
        self, query: str, params: Sequence[Any] | dict[str, Any] | None = None, **kwargs: Any
    ) -> PostgresAgeResult:
        if params is not None:
            kwargs['params'] = params
        return await self._driver.execute_query(query, **kwargs)

    async def execute_write(self, func: Any, *args: Any, **kwargs: Any) -> Any:
        async with self._driver.transaction() as tx:
            result = func(tx, *args, **kwargs)
            if inspect.isawaitable(result):
                return await result
            return result

    async def close(self) -> None:
        pass


async def _run_sql(
    conn: Any, query: str, params: Sequence[Any] | dict[str, Any] | None
) -> PostgresAgeResult:
    async with conn.cursor() as cursor:
        await cursor.execute(query, params)
        keys = _result_keys(cursor)
        if not keys:
            return [], None, []

        rows = await cursor.fetchall()
        return [dict(row) for row in rows], None, keys


def _result_keys(cursor: Any) -> list[str]:
    if cursor.description is None:
        return []

    return [column.name for column in cursor.description]


def _query_params(
    params: Sequence[Any] | dict[str, Any] | None, kwargs: dict[str, Any]
) -> Sequence[Any] | dict[str, Any] | None:
    kwargs.pop('database_', None)
    kwargs.pop('routing_', None)

    if params is not None:
        return params

    if not kwargs:
        return None

    return kwargs
