"""Data management routes: group list, detail, delete, and clone."""

import functools
import json
from collections.abc import Callable
from datetime import datetime
from typing import Any
from uuid import uuid4

from cli.constants import ALL_TABLES  # type: ignore[import-not-found]
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from graph_service.zep_graphiti import ZepGraphitiDep

router = APIRouter()

# Canonical table names
_ALL_TABLES = ALL_TABLES

# Node tables in dependency order (episodic_nodes before saga_nodes due to FK)
_NODE_TABLES = [
    'entity_nodes',
    'episodic_nodes',
    'community_nodes',
    'saga_nodes',
]

# Edge tables — all depend on already-copied nodes
_EDGE_TABLES = [
    'entity_edges',
    'episodic_edges',
    'community_edges',
    'has_episode_edges',
    'next_episode_edges',
]


class CloneRequest(BaseModel):
    """Request body for group clone endpoint."""
    new_group_id: str


def data_endpoint(func: Callable) -> Callable:
    """Decorator that wraps data API endpoints with standard error handling.

    Catches all unhandled exceptions, logs them with a traceback, and
    re-raises as HTTP 500.  HTTPException instances pass through unchanged.
    Non-Response return values are serialized via JSONResponse with a
    ``default=str`` fallback for complex types (numpy arrays, UUIDs, etc.).
    """
    @functools.wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            result = await func(*args, **kwargs)
            if isinstance(result, JSONResponse):
                return result
            return JSONResponse(content=json.loads(json.dumps(result, default=str)))
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            print(f'Error in {func.__name__}: {e}', flush=True)
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e)) from None
    return wrapper


def _get_schema(driver: Any) -> str:
    """Get schema from driver (works with PostgresAgeDriver)."""
    return getattr(driver, 'schema', 'public')  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# GET /data/groups — list all groups with stats
# ---------------------------------------------------------------------------
@router.get('/data/groups', status_code=status.HTTP_200_OK)
@data_endpoint
async def get_groups(graphiti: ZepGraphitiDep):
    """
    Get all groups with statistics.

    Returns list of groups with node/edge counts per table.
    """
    driver = graphiti.driver
    schema = _get_schema(driver)

    groups: dict[str, dict] = {}

    # Query each table for group_id and count
    for table_name in _ALL_TABLES:
        results, _, _ = await driver.execute_query(
            f"SELECT group_id, COUNT(*) as count FROM {schema}.{table_name} GROUP BY group_id"
        )
        for record in results or []:
            gid = record.get('group_id', '')
            if gid not in groups:
                groups[gid] = {'group_id': gid, 'table_counts': {}}
            groups[gid]['table_counts'][table_name] = record.get('count', 0)

    # Calculate totals and get creation time
    result = []
    for gid, data in groups.items():
        table_counts = data['table_counts']
        node_count = sum(table_counts.get(t, 0) for t in _ALL_TABLES if t.endswith('_nodes'))
        edge_count = sum(table_counts.get(t, 0) for t in _ALL_TABLES if t.endswith('_edges'))

        # Get earliest created_at for this group
        created_at_result, _, _ = await driver.execute_query(
            f"SELECT MIN(created_at) as created_at FROM {schema}.entity_nodes WHERE group_id = %(group_id)s",
            params={'group_id': gid}
        )
        created_at = None
        if created_at_result and created_at_result[0].get('created_at'):
            ca = created_at_result[0]['created_at']
            created_at = ca.isoformat() if hasattr(ca, 'isoformat') else str(ca)

        result.append({
            'group_id': gid,
            'created_at': created_at,
            'node_count': node_count,
            'edge_count': edge_count,
            'table_counts': table_counts,
        })

    return result


# ---------------------------------------------------------------------------
# GET /data/groups/{group_id} — group detail with paginated table data
# ---------------------------------------------------------------------------
@router.get('/data/groups/{group_id}', status_code=status.HTTP_200_OK)
@data_endpoint
async def get_group_detail(group_id: str, table: str | None = None, page: int = 1, size: int = 100, graphiti: ZepGraphitiDep = ...):  # type: ignore[assignment]
    """
    Get group details with optional table data pagination.

    If table is specified, returns paginated records from that table.
    """
    driver = graphiti.driver
    schema = _get_schema(driver)

    # Get table counts for this group
    table_counts = {}
    for table_name in _ALL_TABLES:
        count_result, _, _ = await driver.execute_query(
            f"SELECT COUNT(*) as count FROM {schema}.{table_name} WHERE group_id = %(group_id)s",
            params={'group_id': group_id}
        )
        table_counts[table_name] = count_result[0].get('count', 0) if count_result else 0

    total_records = sum(table_counts.values())
    if total_records == 0:
        raise HTTPException(status_code=404, detail=f"Group '{group_id}' not found or empty")

    # If specific table requested, return paginated data
    records = []
    total = 0
    if table:
        if table not in _ALL_TABLES:
            raise HTTPException(status_code=400, detail=f"Invalid table name: {table}")

        total = table_counts.get(table, 0)
        offset = (page - 1) * size

        query_result, _, _ = await driver.execute_query(
            f"SELECT * FROM {schema}.{table} WHERE group_id = %(group_id)s ORDER BY created_at DESC OFFSET %(offset)s LIMIT %(limit)s",
            params={'group_id': group_id, 'offset': offset, 'limit': size}
        )

        # Convert datetime objects to ISO strings
        for record in query_result or []:
            row = {}
            for k, v in record.items():
                if hasattr(v, 'isoformat'):
                    row[k] = v.isoformat()
                else:
                    row[k] = v
            records.append(row)

    return {
        'group_id': group_id,
        'table': table,
        'page': page,
        'size': size,
        'total': total,
        'table_counts': table_counts,
        'records': records,
    }


# ---------------------------------------------------------------------------
# POST /data/groups/{group_id}/clone — clone a group at the DB level
# ---------------------------------------------------------------------------
@router.post('/data/groups/{group_id}/clone', status_code=status.HTTP_201_CREATED)
@data_endpoint
async def clone_group(
    group_id: str,
    body: CloneRequest,
    graphiti: ZepGraphitiDep = ...,  # type: ignore[assignment]
):
    """
    Clone a group by copying all its data to a new group_id at the database level.

    - All 9 tables are copied (4 node + 5 edge).
    - New UUIDs are generated; foreign keys between tables are remapped.
    - The AGE graph projection is rebuilt automatically after the copy.
    """
    new_group_id = body.new_group_id.strip()
    if not new_group_id:
        raise HTTPException(status_code=400, detail='new_group_id must not be empty')

    driver = graphiti.driver
    schema = _get_schema(driver)

    # 1. Verify source group exists
    check_result, _, _ = await driver.execute_query(
        f"SELECT COUNT(*) as count FROM {schema}.entity_nodes WHERE group_id = %(group_id)s",
        params={'group_id': group_id},
    )
    if not check_result or check_result[0].get('count', 0) == 0:
        raise HTTPException(status_code=404, detail=f"Source group '{group_id}' not found or empty")

    # 2. Check target group doesn't already exist
    target_check, _, _ = await driver.execute_query(
        f"SELECT COUNT(*) as count FROM {schema}.entity_nodes WHERE group_id = %(group_id)s",
        params={'group_id': new_group_id},
    )
    if target_check and target_check[0].get('count', 0) > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Target group '{new_group_id}' already contains data. Choose a different name.",
        )

    # 3. Global UUID map: old_uuid -> new_uuid (shared across all node tables)
    uuid_map: dict[str, str] = {}

    # Helper: convert non-JSON-safe values for psycopg INSERT
    def _safe_value(v: Any) -> Any:
        if isinstance(v, dict):
            return json.dumps(v)
        if isinstance(v, list):
            return [json.dumps(item) if isinstance(item, dict) else item for item in v]
        if isinstance(v, datetime):
            return v  # psycopg handles datetime natively
        return v

    # 4. Copy node tables in dependency order
    for table_name in _NODE_TABLES:
        rows, _, _ = await driver.execute_query(
            f"SELECT * FROM {schema}.{table_name} WHERE group_id = %(group_id)s ORDER BY uuid",
            params={'group_id': group_id},
        )
        if not rows:
            continue

        for row in rows:
            old_uuid = str(row['uuid'])
            new_uuid = str(uuid4())
            uuid_map[old_uuid] = new_uuid

            # Build column list, skipping GENERATED columns
            cols = []
            vals = {}
            for k, v in row.items():
                if k == 'search_vector':
                    continue
                if k == 'uuid':
                    cols.append(k)
                    vals[k] = new_uuid
                elif k == 'group_id':
                    cols.append(k)
                    vals[k] = new_group_id
                else:
                    cols.append(k)
                    vals[k] = _safe_value(v)

            cols_str = ', '.join(cols)
            placeholders = ', '.join(f'%({c})s' for c in cols)
            await driver.execute_query(
                f"INSERT INTO {schema}.{table_name} ({cols_str}) VALUES ({placeholders})",
                params=vals,
            )

    # 5. Copy edge tables, remapping source/target node UUIDs
    for table_name in _EDGE_TABLES:
        rows, _, _ = await driver.execute_query(
            f"SELECT * FROM {schema}.{table_name} WHERE group_id = %(group_id)s ORDER BY uuid",
            params={'group_id': group_id},
        )
        if not rows:
            continue

        for row in rows:
            cols = []
            vals = {}
            for k, v in row.items():
                if k == 'search_vector':
                    continue
                if k == 'uuid':
                    cols.append(k)
                    vals[k] = str(uuid4())
                elif k == 'group_id':
                    cols.append(k)
                    vals[k] = new_group_id
                elif k in ('source_node_uuid', 'target_node_uuid'):
                    cols.append(k)
                    vals[k] = uuid_map.get(str(v), str(v))
                else:
                    cols.append(k)
                    vals[k] = _safe_value(v)

            cols_str = ', '.join(cols)
            placeholders = ', '.join(f'%({c})s' for c in cols)
            await driver.execute_query(
                f"INSERT INTO {schema}.{table_name} ({cols_str}) VALUES ({placeholders})",
                params=vals,
            )

    # 6. Rebuild AGE graph projection (includes all groups)
    await driver.graph_ops.rebuild_age_projection(driver)

    # 7. Build table counts for response
    table_counts: dict[str, int] = {}
    for table_name in _ALL_TABLES:
        count_result, _, _ = await driver.execute_query(
            f"SELECT COUNT(*) as count FROM {schema}.{table_name} WHERE group_id = %(group_id)s",
            params={'group_id': new_group_id},
        )
        table_counts[table_name] = count_result[0].get('count', 0) if count_result else 0

    return {
        'success': True,
        'source': group_id,
        'target': new_group_id,
        'table_counts': table_counts,
    }


# ---------------------------------------------------------------------------
# DELETE /data/groups/{group_id} — delete a group and all its data
# ---------------------------------------------------------------------------
@router.delete('/data/groups/{group_id}', status_code=status.HTTP_200_OK)
@data_endpoint
async def delete_group(group_id: str, graphiti: ZepGraphitiDep):
    """
    Delete a group and all its data.
    """
    await graphiti.delete_group(group_id)
    return {'success': True, 'message': f"Group '{group_id}' deleted"}
