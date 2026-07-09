'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchemaListItem {
  id: number;
  name: string;
  description: string;
  entity_type_count: number;
  edge_type_count: number;
}

interface ParsedSchema {
  name: string;
  description: string;
  entity_types: unknown[];
  edge_types: unknown[];
  custom_instructions: string;
}

interface ConflictInfo {
  imported: ParsedSchema;
  existing: SchemaListItem;
}

type ConflictAction = 'skip' | 'overwrite' | 'rename';

interface Toast {
  msg: string;
  type: 'success' | 'error';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SchemasPage() {
  const router = useRouter();
  const [schemas, setSchemas] = useState<SchemaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SchemaListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Import / Export state
  const [importing, setImporting] = useState(false);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [conflictAction, setConflictAction] = useState<ConflictAction>('skip');
  const [renameValue, setRenameValue] = useState('');
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Fetch list
  useEffect(() => {
    let cancelled = false;
    fetch('/api/schemas')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: SchemaListItem[]) => {
        if (!cancelled) {
          setSchemas(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/schemas/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteTarget(null);
        setToast({ msg: 'Schema 已删除', type: 'success' });
        setTimeout(() => setRefreshKey((k) => k + 1), 50);
      } else {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }));
        setDeleteError(err.error || '删除失败');
      }
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  const handleExport = useCallback((s: SchemaListItem) => {
    setExportingId(s.id);

    fetch(`/api/schemas/${s.id}`)
      .then((res) => {
        if (!res.ok) throw new Error('获取 Schema 详情失败');
        return res.json();
      })
      .then((detail) => {
        delete detail.id;
        delete detail.created_at;
        delete detail.updated_at;
        const exportData = detail as ParsedSchema;
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exportData.name}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        const showToast = () => {
          setToast({ msg: `Schema "${exportData.name}" 已导出`, type: 'success' });
          setExportingId(null);
        };

        // If browser opened a "Save As" dialog the window loses focus.
        // Wait until focus returns (dialog closed) before showing toast.
        if (document.hasFocus()) {
          showToast();
        } else {
          const onFocus = () => {
            showToast();
            window.removeEventListener('focus', onFocus);
          };
          window.addEventListener('focus', onFocus);
        }
      })
      .catch((e) => {
        setToast({
          msg: `导出失败: ${e instanceof Error ? e.message : '未知错误'}`,
          type: 'error',
        });
        setExportingId(null);
      });
  }, []);

  // -----------------------------------------------------------------------
  // Import
  // -----------------------------------------------------------------------

  const submitImport = useCallback(
    async (data: ParsedSchema) => {
      setImporting(true);
      try {
        const res = await fetch('/api/schemas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Import failed' }));
          throw new Error(err.error || '导入失败');
        }
        setToast({ msg: `Schema "${data.name}" 已导入`, type: 'success' });
        setTimeout(() => setRefreshKey((k) => k + 1), 50);
      } finally {
        setImporting(false);
      }
    },
    [],
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset input so same file can be re-selected
      e.target.value = '';

      setImporting(true);
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Record<string, unknown>;

        // Validate required fields
        if (!parsed.name || typeof parsed.name !== 'string') {
          throw new Error('缺少 name 字段');
        }
        if (!Array.isArray(parsed.entity_types)) {
          throw new Error('缺少 entity_types 数组');
        }
        if (!Array.isArray(parsed.edge_types)) {
          throw new Error('缺少 edge_types 数组');
        }

        const schemaData: ParsedSchema = {
          name: parsed.name,
          description: (parsed.description as string) || '',
          entity_types: parsed.entity_types as unknown[],
          edge_types: parsed.edge_types as unknown[],
          custom_instructions: (parsed.custom_instructions as string) || '',
        };

        // Check for name conflict
        const existing = schemas.find((s) => s.name === schemaData.name);
        if (existing) {
          setConflict({ imported: schemaData, existing });
          setConflictAction('skip');
          setRenameValue(`${schemaData.name}_copy`);
          setConflictError(null);
          setImporting(false);
        } else {
          await submitImport(schemaData);
        }
      } catch (e) {
        setToast({
          msg: `导入失败: ${e instanceof Error ? e.message : '无效的 JSON 文件'}`,
          type: 'error',
        });
        setImporting(false);
      }
    },
    [schemas, submitImport],
  );

  const handleConflictResolve = useCallback(async () => {
    if (!conflict) return;
    setConflictError(null);

    if (conflictAction === 'skip') {
      setConflict(null);
      setToast({ msg: '已跳过导入', type: 'success' });
      return;
    }

    try {
      if (conflictAction === 'overwrite') {
        setImporting(true);
        const res = await fetch(`/api/schemas/${conflict.existing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(conflict.imported),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Update failed' }));
          throw new Error(err.error || '覆盖失败');
        }
        setToast({ msg: `Schema "${conflict.imported.name}" 已覆盖更新`, type: 'success' });
      } else {
        // rename
        if (!renameValue.trim()) {
          setConflictError('请输入新名称');
          return;
        }
        setImporting(true);
        const renamed = { ...conflict.imported, name: renameValue.trim() };
        const res = await fetch('/api/schemas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(renamed),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Create failed' }));
          throw new Error(err.error || '创建失败');
        }
        setToast({ msg: `Schema "${renamed.name}" 已导入`, type: 'success' });
      }
      setConflict(null);
      setTimeout(() => setRefreshKey((k) => k + 1), 50);
    } catch (e) {
      setConflictError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setImporting(false);
    }
  }, [conflict, conflictAction, renameValue]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Schema 管理</h2>
          <p className="text-sm text-muted-foreground">管理实体提取的 Schema 定义</p>
        </div>
        <div className="flex items-center gap-2">
          <label
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'cursor-pointer select-auto',
              importing && 'pointer-events-none opacity-50',
            )}
          >
            <input
              type="file"
              accept=".json"
              className="sr-only"
              onChange={handleFileChange}
            />
            {importing ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            导入 Schema
          </label>
          <Button size="sm" onClick={() => router.push('/settings/schemas/new')}>
            <Plus className="mr-1 h-4 w-4" />
            新建 Schema
          </Button>
        </div>
      </div>

      {/* Toast — fixed top-center overlay */}
      {toast && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center pointer-events-none">
          <div
            className={cn(
              'pointer-events-auto rounded-lg border px-4 py-2.5 text-sm shadow-lg',
              toast.type === 'success'
                ? 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400'
                : 'border-destructive/20 bg-destructive/10 text-destructive',
            )}
          >
            {toast.msg}
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">名称</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">描述</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">实体类型</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">关系类型</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {schemas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      暂无 Schema，点击&ldquo;新建 Schema&rdquo;创建第一个提取模板
                    </td>
                  </tr>
                ) : (
                  schemas.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.description || '-'}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {s.entity_type_count}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px]">
                          {s.edge_type_count}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => router.push(`/settings/schemas/${s.id}/edit`)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleExport(s)}
                            disabled={exportingId === s.id}
                          >
                            {exportingId === s.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setDeleteTarget(s)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除确认</DialogTitle>
            <DialogDescription>
              确定要删除 Schema &quot;{deleteTarget?.name}&quot; 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2">
              <p className="text-sm text-destructive">{deleteError}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import conflict dialog */}
      <Dialog
        open={conflict !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConflict(null);
            setConflictError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>导入冲突</DialogTitle>
            <DialogDescription>
              Schema &quot;{conflict?.imported.name}&quot; 已存在，请选择处理方式：
            </DialogDescription>
          </DialogHeader>

          {conflictError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2">
              <p className="text-sm text-destructive">{conflictError}</p>
            </div>
          )}

          <div className="space-y-3">
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                conflictAction === 'skip'
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50',
              )}
            >
              <input
                type="radio"
                name="conflict-action"
                checked={conflictAction === 'skip'}
                onChange={() => setConflictAction('skip')}
                className="accent-primary"
              />
              <div>
                <p className="text-sm font-medium">跳过</p>
                <p className="text-xs text-muted-foreground">不导入此 Schema</p>
              </div>
            </label>

            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                conflictAction === 'overwrite'
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50',
              )}
            >
              <input
                type="radio"
                name="conflict-action"
                checked={conflictAction === 'overwrite'}
                onChange={() => setConflictAction('overwrite')}
                className="accent-primary"
              />
              <div>
                <p className="text-sm font-medium">覆盖已有 Schema</p>
                <p className="text-xs text-muted-foreground">
                  用导入内容替换现有的 &quot;{conflict?.existing.name}&quot;
                </p>
              </div>
            </label>

            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                conflictAction === 'rename'
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50',
              )}
            >
              <input
                type="radio"
                name="conflict-action"
                checked={conflictAction === 'rename'}
                onChange={() => setConflictAction('rename')}
                className="mt-0.5 accent-primary"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">重命名为</p>
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onFocus={() => setConflictAction('rename')}
                  placeholder="输入新名称"
                  className="mt-1"
                />
              </div>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConflict(null);
                setConflictError(null);
              }}
              disabled={importing}
            >
              取消
            </Button>
            <Button onClick={handleConflictResolve} disabled={importing}>
              {importing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              确认导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
