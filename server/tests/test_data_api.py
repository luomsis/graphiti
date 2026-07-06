"""Tests for Data API router."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

# Mock the ZepGraphiti before importing the app
@pytest.fixture
def mock_graphiti():
    """Create a mock Graphiti instance."""
    graphiti = MagicMock()
    driver = MagicMock()
    driver.schema = 'test_schema'
    driver.execute_query = AsyncMock(return_value=([], None, []))
    graphiti.driver = driver
    return graphiti


@pytest.fixture
def client(mock_graphiti):
    """Create a test client with mocked dependencies."""
    # Import after mocking
    from fastapi import FastAPI
    from graph_service.routers import data

    app = FastAPI()
    app.include_router(data.router, prefix='/rest')

    # Override the dependency
    async def override_graphiti():
        return mock_graphiti

    from graph_service.zep_graphiti import get_graphiti
    app.dependency_overrides[get_graphiti] = override_graphiti

    return TestClient(app)


class TestGetGroups:
    async def test_get_groups_empty(self, client, mock_graphiti):
        """Test getting groups when none exist."""
        mock_graphiti.driver.execute_query.return_value = ([], None, [])

        response = client.get('/rest/data/groups')
        assert response.status_code == 200
        assert response.json() == []

    async def test_get_groups_with_data(self, client, mock_graphiti):
        """Test getting groups with data."""
        # Mock responses for each table query
        def execute_query_side_effect(query, params=None):
            if 'entity_nodes' in query:
                return ([{'group_id': 'group_a', 'count': 10}], None, [])
            return ([], None, [])

        mock_graphiti.driver.execute_query.side_effect = execute_query_side_effect

        response = client.get('/rest/data/groups')
        assert response.status_code == 200
        result = response.json()
        assert len(result) >= 1
        assert result[0]['group_id'] == 'group_a'

