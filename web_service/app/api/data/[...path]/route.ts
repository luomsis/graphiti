// app/api/data/[...path]/route.ts
// Proxy all /api/data/* requests to Python backend /rest/data/*
//
// JSON requests use fetchFromBackend for consistency with other BFF routes.
// Multipart uploads and binary downloads (ZIP) use raw fetch since
// fetchFromBackend forces Content-Type: application/json.

import { NextRequest, NextResponse } from 'next/server';
import { fetchFromBackend } from '@/lib/api-client';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

type RouteContext = { params: Promise<{ path: string[] }> };

/** Build the backend URL from the route path and query string. */
async function backendUrl(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return `${PYTHON_API_URL}/rest/data/${path.join('/')}${req.nextUrl.search}`;
}

// --- GET ----------------------------------------------------------------

export async function GET(req: NextRequest, context: RouteContext) {
  // Use raw fetch for GET so we can handle binary responses (ZIP, JSON downloads)
  const url = await backendUrl(req, context);

  try {
    const res = await fetch(url);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Backend error' }));
      return NextResponse.json(
        { error: err.error || err.detail || 'Proxy error' },
        { status: res.status },
      );
    }

    // Binary download (ZIP file)
    const resCt = res.headers.get('content-type') || '';
    if (resCt.includes('application/zip')) {
      const headers: Record<string, string> = {
        'Content-Type': resCt,
      };
      const cd = res.headers.get('content-disposition');
      if (cd) headers['Content-Disposition'] = cd;
      return new NextResponse(await res.arrayBuffer(), {
        status: res.status,
        headers,
      });
    }

    // JSON response
    const data = await res.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Proxy error' },
      { status: 502 },
    );
  }
}

// --- POST ---------------------------------------------------------------

export async function POST(req: NextRequest, context: RouteContext) {
  const contentType = req.headers.get('content-type') || '';

  // Multipart upload — forward raw body to backend
  if (contentType.includes('multipart/form-data')) {
    const url = await backendUrl(req, context);
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: await req.arrayBuffer(),
        headers: { 'Content-Type': contentType },
      });

      // Binary download (ZIP / JSON attachment)
      const resCt = res.headers.get('content-type') || '';
      if (resCt.includes('application/zip')) {
        const headers: Record<string, string> = {
          'Content-Type': resCt,
        };
        const cd = res.headers.get('content-disposition');
        if (cd) headers['Content-Disposition'] = cd;
        return new NextResponse(await res.arrayBuffer(), {
          status: res.status,
          headers,
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Backend error' }));
        return NextResponse.json(err, { status: res.status });
      }

      return NextResponse.json(await res.json(), { status: res.status });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Proxy error' },
        { status: 500 },
      );
    }
  }

  // JSON request — use fetchFromBackend
  const { path } = await context.params;
  const backendPath = `/rest/data/${path.join('/')}`;

  try {
    const body = await req.text();
    const data = await fetchFromBackend({
      path: backendPath,
      method: 'POST',
      body,
    });
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Proxy error' },
      { status: 502 },
    );
  }
}

// --- DELETE -------------------------------------------------------------

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const backendPath = `/rest/data/${path.join('/')}`;

  try {
    const data = await fetchFromBackend({
      path: backendPath,
      method: 'DELETE',
    });
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Proxy error' },
      { status: 502 },
    );
  }
}
