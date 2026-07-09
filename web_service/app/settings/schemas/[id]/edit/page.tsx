'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { SchemaFormEditor, type SchemaDetail, type SchemaForm } from '@/components/settings/schema-form';

export default function EditSchemaPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const schemaId = params.id;

  const [detail, setDetail] = useState<SchemaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/schemas/${schemaId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Schema 未找到');
        return res.json();
      })
      .then((data: SchemaDetail) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schemaId]);

  const handleUpdate = async (data: SchemaForm) => {
    const res = await fetch(`/api/schemas/${schemaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '更新失败' }));
      throw new Error(err.error || err.detail || '更新失败');
    }
    router.push('/settings/schemas');
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">{error || 'Schema 未找到'}</p>
        <button
          onClick={() => router.push('/settings/schemas')}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <SchemaFormEditor
      title="编辑 Schema"
      initialData={detail}
      onSubmit={handleUpdate}
      submitLabel="保存"
    />
  );
}
