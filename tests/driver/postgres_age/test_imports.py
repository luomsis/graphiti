import importlib

from graphiti_core.driver.driver import GraphProvider


def test_postgres_age_provider_exists():
    assert GraphProvider.POSTGRES_AGE.value == 'postgres_age'


def test_postgres_age_public_export():
    module = importlib.import_module('graphiti_core.driver.postgres_age')
    assert hasattr(module, 'PostgresAgeDriver')
