from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from pgvector.psycopg import register_vector_async
from psycopg import AsyncConnection, sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


class PostgresAgeSpike:
    def __init__(self, dsn: str, graph_name: str = 'graphiti_spike') -> None:
        self.dsn = dsn
        self.graph_name = graph_name
        self.pool: AsyncConnectionPool | None = None

    async def open(self) -> None:
        self.pool = AsyncConnectionPool(self.dsn, open=False)
        await self.pool.open()

    async def close(self) -> None:
        if self.pool is not None:
            await self.pool.close()
            self.pool = None

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[AsyncConnection]:
        if self.pool is None:
            raise RuntimeError('PostgresAgeSpike.open() must be called before use')
        async with self.pool.connection() as conn:
            await self._setup_age_session(conn)
            yield conn

    async def _setup_age_session(self, conn: AsyncConnection) -> None:
        await register_vector_async(conn)
        async with conn.cursor() as cur:
            await cur.execute("LOAD 'age'")
            await cur.execute('SET search_path = ag_catalog, "$user", public')

    async def execute_sql(self, query: str, params: dict[str, Any] | None = None) -> list[dict]:
        async with self.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(query, params or {})
                if cur.description is None:
                    return []
                rows = await cur.fetchall()
                return [dict(row) for row in rows]

    async def execute_cypher(self, cypher_query: str, columns: str) -> list[dict]:
        query = sql.SQL('SELECT * FROM cypher({}, $$ {} $$) AS ({})').format(
            sql.Literal(self.graph_name),
            sql.SQL(cypher_query),
            sql.SQL(columns),
        )
        async with self.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(query)
                rows = await cur.fetchall()
                return [dict(row) for row in rows]

    @staticmethod
    def decode_agtype_scalar(value: Any) -> Any:
        text = str(value)
        if text.endswith('::numeric'):
            text = text.removesuffix('::numeric')
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text.strip('"')
