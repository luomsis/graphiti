'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EdgeData {
  uuid: string;
  name: string;
  fact: string;
  source_node_uuid: string;
  target_node_uuid: string;
}

interface NodeOption {
  uuid: string;
  name: string;
}

interface EdgeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edge: EdgeData | null;
  isNew: boolean;
  nodes: NodeOption[];
  onSave: (
    uuid: string,
    data: { name: string; fact: string; source_node_uuid: string; target_node_uuid: string },
  ) => void;
}

export function EdgeEditDialog({
  open,
  onOpenChange,
  edge,
  isNew,
  nodes,
  onSave,
}: EdgeEditDialogProps) {
  const [name, setName] = useState('');
  const [fact, setFact] = useState('');
  const [sourceUuid, setSourceUuid] = useState('');
  const [targetUuid, setTargetUuid] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (edge) {
      setName(edge.name);
      setFact(edge.fact);
      setSourceUuid(edge.source_node_uuid);
      setTargetUuid(edge.target_node_uuid);
      setError(null);
    } else if (isNew && nodes.length > 0) {
      setName('');
      setFact('');
      setSourceUuid(nodes[0].uuid);
      setTargetUuid(nodes.length > 1 ? nodes[1].uuid : nodes[0].uuid);
      setError(null);
    }
  }, [edge, isNew, nodes]);

  const handleSave = () => {
    if (!sourceUuid || !targetUuid) {
      setError('请选择源节点和目标节点');
      return;
    }
    if (!edge) return;
    onSave(edge.uuid, {
      name: name.trim(),
      fact: fact.trim(),
      source_node_uuid: sourceUuid,
      target_node_uuid: targetUuid,
    });
    onOpenChange(false);
  };

  const hasNodes = nodes.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? '新建关系' : '编辑关系'}</DialogTitle>
        </DialogHeader>

        {!hasNodes ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            请先添加节点后再创建关系
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">关系名称</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="FOUNDED"
                className="h-8 text-sm"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">事实描述</Label>
              <textarea
                value={fact}
                onChange={(e) => setFact(e.target.value)}
                placeholder="关系的具体描述..."
                rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">源节点</Label>
                <select
                  value={sourceUuid}
                  onChange={(e) => setSourceUuid(e.target.value)}
                  className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {nodes.map((n) => (
                    <option key={n.uuid} value={n.uuid}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">目标节点</Label>
                <select
                  value={targetUuid}
                  onChange={(e) => setTargetUuid(e.target.value)}
                  className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {nodes.map((n) => (
                    <option key={n.uuid} value={n.uuid}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!hasNodes}>
            {isNew ? '添加' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
