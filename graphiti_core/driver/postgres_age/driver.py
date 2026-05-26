from __future__ import annotations

from collections.abc import Coroutine
from typing import Any

from graphiti_core.driver.driver import GraphDriver, GraphDriverSession, GraphProvider


class PostgresAgeDriver(GraphDriver):
    provider = GraphProvider.POSTGRES_AGE

    def execute_query(self, cypher_query_: str, **kwargs: Any) -> Coroutine:
        raise NotImplementedError()

    def session(self, database: str | None = None) -> GraphDriverSession:
        raise NotImplementedError()

    def close(self) -> None:
        raise NotImplementedError()

    def delete_all_indexes(self) -> Coroutine:
        raise NotImplementedError()

    async def build_indices_and_constraints(self, delete_existing: bool = False) -> None:
        raise NotImplementedError()
