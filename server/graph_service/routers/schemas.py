from fastapi import APIRouter, HTTPException, status
from psycopg import errors as pg_errors

from graph_service.config import get_settings
from graph_service.dto.schemas import (
    ExtractionSchemaCreate,
    ExtractionSchemaListItem,
    ExtractionSchemaResponse,
)
from graph_service.models import (
    create_schema,
    delete_schema,
    get_schema,
    list_schemas,
    update_schema,
)

router = APIRouter(tags=['schemas'])


def _dsn() -> str:
    return get_settings().postgres_age_dsn


def _row_to_response(row: dict) -> ExtractionSchemaResponse:
    return ExtractionSchemaResponse(
        id=row['id'],
        name=row['name'],
        description=row.get('description', ''),
        entity_types=row.get('entity_types', []),
        edge_types=row.get('edge_types', []),
        custom_instructions=row.get('custom_instructions', ''),
        created_at=row['created_at'],
        updated_at=row['updated_at'],
    )


@router.get('/schemas', response_model=list[ExtractionSchemaListItem])
async def list_all_schemas():
    rows = await list_schemas(_dsn())
    return [
        ExtractionSchemaListItem(
            id=r['id'],
            name=r['name'],
            description=r.get('description', ''),
            entity_type_count=r.get('entity_type_count', 0),
            edge_type_count=r.get('edge_type_count', 0),
        )
        for r in rows
    ]


@router.get('/schemas/{schema_id}', response_model=ExtractionSchemaResponse)
async def get_schema_by_id(schema_id: int):
    row = await get_schema(_dsn(), schema_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Schema not found')
    return _row_to_response(row)


@router.post(
    '/schemas', response_model=ExtractionSchemaResponse, status_code=status.HTTP_201_CREATED
)
async def create_new_schema(body: ExtractionSchemaCreate):
    data = body.model_dump()
    # Convert Pydantic models to plain dicts for JSONB storage
    data['entity_types'] = [
        et if isinstance(et, dict) else et for et in data.get('entity_types', [])
    ]
    data['edge_types'] = [et if isinstance(et, dict) else et for et in data.get('edge_types', [])]
    try:
        row = await create_schema(_dsn(), data)
    except pg_errors.UniqueViolation as exc:
        raise HTTPException(
            status_code=409, detail=f"Schema with name '{body.name}' already exists"
        ) from exc
    return _row_to_response(row)


@router.put('/schemas/{schema_id}', response_model=ExtractionSchemaResponse)
async def update_existing_schema(schema_id: int, body: ExtractionSchemaCreate):
    data = body.model_dump()
    data['entity_types'] = [
        et if isinstance(et, dict) else et for et in data.get('entity_types', [])
    ]
    data['edge_types'] = [et if isinstance(et, dict) else et for et in data.get('edge_types', [])]
    row = await update_schema(_dsn(), schema_id, data)
    if row is None:
        raise HTTPException(status_code=404, detail='Schema not found')
    return _row_to_response(row)


@router.delete('/schemas/{schema_id}', status_code=status.HTTP_200_OK)
async def delete_existing_schema(schema_id: int):
    deleted = await delete_schema(_dsn(), schema_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='Schema not found')
    return {'message': 'Schema deleted', 'success': True}
