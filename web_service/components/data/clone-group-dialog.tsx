'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CloneGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceGroupId: string;
  onCloned: () => void;
}

export function CloneGroupDialog({
  open,
  onOpenChange,
  sourceGroupId,
  onCloned,
}: CloneGroupDialogProps) {
  const [newGroupId, setNewGroupId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClone = async () => {
    const trimmed = newGroupId.trim();
    if (!trimmed) {
      setError('请输入新分组名称');
      return;
    }
    if (trimmed === sourceGroupId) {
      setError('新分组名称不能与源分组相同');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/data/groups/${encodeURIComponent(sourceGroupId)}/clone`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_group_id: trimmed }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Clone failed' }));
        throw new Error(data.detail || data.error || 'Clone failed');
      }
      setNewGroupId('');
      onCloned();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setNewGroupId(''); setError(null); } onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>克隆分组</DialogTitle>
          <DialogDescription>
            复制 <strong>{sourceGroupId}</strong> 的所有数据到新分组。
            克隆会生成独立的 UUID 副本，两个分组互不影响。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="block text-sm font-medium" htmlFor="new-group-id">
            新分组名称
          </label>
          <input
            id="new-group-id"
            type="text"
            value={newGroupId}
            onChange={(e) => { setNewGroupId(e.target.value); setError(null); }}
            placeholder="例如: corp-backup"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={(e) => { if (e.key === 'Enter' && !loading) handleClone(); }}
            autoFocus
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleClone} disabled={loading || !newGroupId.trim()}>
            {loading ? '克隆中...' : '确认克隆'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
