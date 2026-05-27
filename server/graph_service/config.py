from enum import Enum
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict  # type: ignore


class DatabaseProvider(str, Enum):
    NEO4J = 'neo4j'
    POSTGRES_AGE = 'postgres_age'


class Settings(BaseSettings):
    openai_api_key: str
    openai_base_url: str | None = Field(None)
    model_name: str | None = Field(None)
    embedding_model_name: str | None = Field(None)
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str

    # Postgres AGE configuration (alternative to Neo4j)
    database_provider: DatabaseProvider = Field(default=DatabaseProvider.NEO4J)
    postgres_age_dsn: str | None = Field(default=None)
    postgres_age_graph_name: str | None = Field(default=None)
    postgres_age_embedding_dimension: int = Field(default=384)

    model_config = SettingsConfigDict(env_file='.env', extra='ignore')


@lru_cache
def get_settings():
    return Settings()  # type: ignore[call-arg]


ZepEnvDep = Annotated[Settings, Depends(get_settings)]
