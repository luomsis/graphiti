// app/api/knowledge/clone/route.ts
// POST /api/knowledge/clone — proxy to POST /rest/graph/groups/{group_id}/clone

import { fetchFromBackend } from '@/lib/api-client';

export async function POST(request: Request) {
  try {
    const { group_id, new_group_id } = await request.json();

    if (!group_id || !new_group_id) {
      return Response.json(
        { error: 'group_id and new_group_id are required' },
        { status: 400 },
      );
    }

    const result = await fetchFromBackend(
      `/rest/graph/groups/${encodeURIComponent(group_id)}/clone`,
      {
        method: 'POST',
        body: JSON.stringify({ new_group_id }),
      },
    );

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Clone failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
