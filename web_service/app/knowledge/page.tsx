'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, PlusCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DocumentTable } from '@/components/knowledge/document-table';
import { IngestDialog } from '@/components/knowledge/ingest-dialog';
import { CloneGroupDialog } from '@/components/data/clone-group-dialog';
import type { Document, DocumentStatus } from '@/lib/types';

interface GroupOption {
  id: string;
  name: string;
  count: number;
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [groupId, setGroupId] = useState('all');
  const [ingestOpen, setIngestOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);

  const fetchGroups = useCallback(async (): Promise<GroupOption[]> => {
    try {
      const res = await fetch('/api/graph/groups', { cache: 'no-store' });
      if (!res.ok) return [];
      return (await res.json()) as GroupOption[];
    } catch {
      return [];
    }
  }, []);

  const fetchDocuments = useCallback(async (): Promise<Document[]> => {
    const res = await fetch('/api/knowledge', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch');
    return (await res.json()) as Document[];
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [docs, grps] = await Promise.all([fetchDocuments(), fetchGroups()]);
      setDocuments(docs);
      setGroups(grps);
    } catch (err) {
      console.error('Failed to refresh:', err);
    }
  }, [fetchDocuments, fetchGroups]);

  // Initial load
  useEffect(() => {
    refreshAll().finally(() => setLoading(false));
  }, [refreshAll]);

  // Delete a document
  const handleDelete = useCallback(async (doc: Document) => {
    const confirmed = window.confirm(
      `Delete "${doc.name}"?\n\nThis removes the document and its extracted entities from the knowledge graph. This action cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/knowledge/${encodeURIComponent(doc.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }));
        throw new Error(err.error || 'Delete failed');
      }
      await refreshAll();
    } catch (error) {
      console.error('Failed to delete document:', error);
      window.alert(
        `Failed to delete "${doc.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }, [refreshAll]);

  // After ingest commit: refresh everything
  const handleIngestCommitted = useCallback(() => {
    refreshAll();
  }, [refreshAll]);

  // After group cloned: refresh groups
  const handleCloned = useCallback(() => {
    refreshAll();
  }, [refreshAll]);

  const filteredDocuments = documents.filter((doc) => {
    if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
    if (groupId !== 'all' && doc.group_id !== groupId) return false;
    if (search && !doc.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Knowledge Management</h2>
          <p className="text-sm text-muted-foreground">
            {documents.length} items total
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Group dropdown + Clone button */}
        <div className="flex items-center gap-1">
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="h-8 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All Groups</option>
            {groups.map((g) => (
              <option key={g.id || g.name} value={g.id || g.name}>
                {g.id || g.name} ({g.count})
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={groupId === 'all'}
            onClick={() => setCloneOpen(true)}
            title="克隆当前分组"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | 'all')}
          className="h-8 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">All Status</option>
          <option value="completed">✅ 已处理</option>
          <option value="processing">🔄 处理中</option>
          <option value="pending">⏳ 排队中</option>
          <option value="failed">❌ 失败</option>
        </select>

        {/* New Knowledge button */}
        <Button size="sm" onClick={() => setIngestOpen(true)}>
          <PlusCircle className="h-4 w-4 mr-1" />
          新建知识
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          Loading...
        </div>
      ) : (
        <DocumentTable documents={filteredDocuments} onDelete={handleDelete} />
      )}

      {/* Ingest Dialog */}
      <IngestDialog
        open={ingestOpen}
        onOpenChange={setIngestOpen}
        groups={groups}
        onCommitted={handleIngestCommitted}
      />

      {/* Clone Dialog */}
      {groupId !== 'all' && (
        <CloneGroupDialog
          open={cloneOpen}
          onOpenChange={setCloneOpen}
          sourceGroupId={groupId}
          onCloned={handleCloned}
        />
      )}
    </div>
  );
}
