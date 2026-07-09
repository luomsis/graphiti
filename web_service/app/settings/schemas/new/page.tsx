'use client';

import { useRouter } from 'next/navigation';
import { SchemaFormEditor, type SchemaForm } from '@/components/settings/schema-form';

export default function NewSchemaPage() {
  const router = useRouter();

  const handleCreate = async (data: SchemaForm) => {
    const res = await fetch('/api/schemas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '创建失败' }));
      throw new Error(err.error || err.detail || '创建失败');
    }
    router.push('/settings/schemas');
  };

  return (
    <SchemaFormEditor
      title="新建 Schema"
      onSubmit={handleCreate}
      submitLabel="创建"
    />
  );
}
