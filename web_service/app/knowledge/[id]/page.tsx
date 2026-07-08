'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FactResult {
  uuid: string;
  name: string;
  fact: string;
  valid_at: string | null;
  invalid_at: string | null;
  source_node_uuid: string;
  target_node_uuid: string;
}

interface EntityNode {
  id: string;
  name: string;
  labels: string[];
  summary: string;
  group_id: string;
}

interface DocDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  entityCount: number;
  createdAt: string;
  group_id: string;
  content: string;
  facts: FactResult[];
  entities: EntityNode[];
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/knowledge/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed to fetch' }));
          throw new Error(err.error || 'Failed to fetch');
        }
        return res.json();
      })
      .then((data: DocDetail) => setDoc(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!doc) return;
    const confirmed = window.confirm(
      `Delete "${doc.name}"?\n\nThis removes the document and its extracted entities from the knowledge graph. This action cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/knowledge/${encodeURIComponent(doc.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }));
        throw new Error(err.error || 'Delete failed');
      }
      router.push('/knowledge');
    } catch (err) {
      window.alert(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/knowledge')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{error || 'Not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/knowledge')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{doc.name}</h2>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="outline">{doc.type}</Badge>
              <Badge variant="secondary">{doc.group_id}</Badge>
              <Badge>{doc.entities.length} entities</Badge>
              <Badge variant="outline">{doc.facts.length} Relationships</Badge>
            </div>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
          <Trash2 className="mr-1 h-4 w-4" />
          {deleting ? 'Deleting...' : 'Delete'}
        </Button>
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground max-h-[600px] overflow-y-auto">
            {doc.content || '(empty)'}
          </pre>
        </CardContent>
      </Card>

      {/* Extracted Entities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Entities ({doc.entities.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {doc.entities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No entities extracted.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-[30%]">实体</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.entities.map((entity) => (
                    <tr key={entity.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entity.name}</span>
                          {entity.labels && entity.labels.length > 0 && entity.labels.map((label) => (
                            <span
                              key={label}
                              className="rounded border border-primary/30 bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground align-top">
                        {entity.summary || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extracted facts / edges */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Relationships ({doc.facts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {doc.facts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No relationships extracted.
            </p>
          ) : (
            <ul className="space-y-2">
              {doc.facts.map((fact, i) => {
                const sourceEntity = doc.entities.find((e) => e.id === fact.source_node_uuid);
                const targetEntity = doc.entities.find((e) => e.id === fact.target_node_uuid);
                return (
                  <li
                    key={fact.uuid || i}
                    className="flex items-start gap-2 rounded-md border p-3 text-sm"
                  >
                    <span className="mt-0.5 text-xs font-bold text-muted-foreground">
                      {i + 1}.
                    </span>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {sourceEntity && (
                          <Badge variant="secondary">{sourceEntity.name}</Badge>
                        )}
                        {fact.name && (
                          <span className="font-medium text-primary">— {fact.name} →</span>
                        )}
                        {targetEntity && (
                          <Badge variant="secondary">{targetEntity.name}</Badge>
                        )}
                      </div>
                      <p className="mt-1.5">{fact.fact}</p>
                      {fact.valid_at && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Valid: {new Date(fact.valid_at).toLocaleDateString()}
                          {fact.invalid_at
                            ? ` — ${new Date(fact.invalid_at).toLocaleDateString()}`
                            : ' — present'}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
