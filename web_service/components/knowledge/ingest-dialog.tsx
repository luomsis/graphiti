'use client';

import { useCallback, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, FileText, Loader2, Type, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EpisodePreview {
  uuid: string;
  name: string;
  content: string;
  group_id: string;
  source: string;
  source_description: string;
}

interface NodePreview {
  uuid: string;
  name: string;
  labels: string[];
  summary: string;
  group_id: string;
  is_new: boolean;
}

interface EdgePreview {
  uuid: string;
  name: string;
  fact: string;
  source_node_uuid: string;
  source_node_name: string;
  target_node_uuid: string;
  target_node_name: string;
  valid_at: string | null;
  invalid_at: string | null;
}

interface PreviewMemoryResponse {
  episode: EpisodePreview;
  nodes: NodePreview[];
  edges: EdgePreview[];
  invalidated_edges: EdgePreview[];
}

type IngestStep = 'input' | 'processing' | 'review';
type InputMode = 'text' | 'file';

interface GroupOption {
  id: string;
  name: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Stage definitions
// ---------------------------------------------------------------------------

const STAGES = [
  { key: 'retrieving_context', label: '检索上下文' },
  { key: 'extracting_entities', label: '提取实体' },
  { key: 'resolving_entities', label: '解析实体（去重/合并）' },
  { key: 'extracting_edges', label: '提取关系' },
  { key: 'resolving_edges', label: '解析关系（去重/矛盾检测）' },
  { key: 'extracting_attributes', label: '提取属性摘要' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface IngestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupOption[];
  onCommitted: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IngestDialog({ open, onOpenChange, groups, onCommitted }: IngestDialogProps) {
  // Step 1 state
  const [step, setStep] = useState<IngestStep>('input');
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [source, setSource] = useState('text');
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [customGroup, setCustomGroup] = useState('');
  const [showCustomGroup, setShowCustomGroup] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Processing state
  const [stage, setStage] = useState('');
  const [pollError, setPollError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  // Preview result state
  const [preview, setPreview] = useState<PreviewMemoryResponse | null>(null);
  const [excludedNodeIds, setExcludedNodeIds] = useState<Set<string>>(new Set());
  const [excludedEdgeIds, setExcludedEdgeIds] = useState<Set<string>>(new Set());

  // Commit state
  const [committing, setCommitting] = useState(false);

  // Resolve effective group ID
  const effectiveGroupId = showCustomGroup ? (customGroup.trim() || 'default') : (groupId || 'default');

  // Auto-select first group when groups load and step is input
  if (step === 'input' && !groupId && groups.length > 0) {
    setGroupId(groups[0].id || groups[0].name);
  }

  // ---------------------------------------------------------------------------
  // Reset all state
  // ---------------------------------------------------------------------------

  const resetState = () => {
    setStep('input');
    setContent('');
    setName('');
    setGroupId(groups.length > 0 ? (groups[0].id || groups[0].name) : '');
    setSource('text');
    setInputMode('text');
    setCustomGroup('');
    setShowCustomGroup(false);
    setFileName('');
    setStage('');
    setPollError(null);
    cancelRef.current = false;
    setPreview(null);
    setExcludedNodeIds(new Set());
    setExcludedEdgeIds(new Set());
    setCommitting(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  // ---------------------------------------------------------------------------
  // Preview handler
  // ---------------------------------------------------------------------------

  const handlePreview = useCallback(async () => {
    if (!content.trim()) return;

    setStep('processing');
    setPollError(null);
    cancelRef.current = false;

    try {
      const res = await fetch('/api/knowledge/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || fileName || `Preview: ${content.slice(0, 50)}`,
          content,
          group_id: effectiveGroupId,
          source,
          source_description: 'Knowledge page ingest',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Preview submit failed' }));
        throw new Error(err.error);
      }
      const { task_id } = await res.json();

      while (!cancelRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelRef.current) break;

        const poll = await fetch(`/api/knowledge/preview/${encodeURIComponent(task_id)}`);
        if (!poll.ok) continue;
        const data = await poll.json();

        setStage(data.stage || '');

        if (data.status === 'completed' && data.result) {
          setPreview(data.result as PreviewMemoryResponse);
          setStep('review');
          return;
        }
        if (data.status === 'failed') {
          throw new Error(data.error || 'Preview failed');
        }
      }

      if (cancelRef.current) {
        setStep('input');
      }
    } catch (err) {
      setPollError(err instanceof Error ? err.message : 'Unknown error');
      setStep('input');
    }
  }, [content, name, effectiveGroupId, source, fileName]);

  const handleCancel = () => {
    cancelRef.current = true;
  };

  // ---------------------------------------------------------------------------
  // Commit handler
  // ---------------------------------------------------------------------------

  const handleCommit = useCallback(async () => {
    if (!preview) return;
    setCommitting(true);

    try {
      const confirmedNodes = preview.nodes.filter((n) => !excludedNodeIds.has(n.uuid));
      const confirmedEdges = preview.edges.filter((e) => !excludedEdgeIds.has(e.uuid));

      const res = await fetch('/api/knowledge/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode: preview.episode,
          nodes: confirmedNodes,
          edges: confirmedEdges,
          group_id: effectiveGroupId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Commit failed' }));
        throw new Error(err.error);
      }

      resetState();
      onCommitted();
      onOpenChange(false);
    } catch (err) {
      window.alert(`Commit failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setCommitting(false);
    }
  }, [preview, excludedNodeIds, excludedEdgeIds, effectiveGroupId, onCommitted, onOpenChange]);

  // ---------------------------------------------------------------------------
  // Toggle helpers
  // ---------------------------------------------------------------------------

  const toggleNode = (uuid: string) => {
    setExcludedNodeIds((prev) => {
      const next = new Set(prev);
      next.has(uuid) ? next.delete(uuid) : next.add(uuid);
      return next;
    });
  };

  const toggleEdge = (uuid: string) => {
    setExcludedEdgeIds((prev) => {
      const next = new Set(prev);
      next.has(uuid) ? next.delete(uuid) : next.add(uuid);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Stage progress helper
  // ---------------------------------------------------------------------------

  const getStageStatus = (stageKey: string): 'done' | 'active' | 'pending' => {
    const currentIdx = STAGES.findIndex((s) => s.key === stage);
    const stageIdx = STAGES.findIndex((s) => s.key === stageKey);
    if (stageIdx < 0 || currentIdx < 0) return 'pending';
    if (stageIdx < currentIdx) return 'done';
    if (stageIdx === currentIdx) return 'active';
    return 'pending';
  };

  // ---------------------------------------------------------------------------
  // File upload handler
  // ---------------------------------------------------------------------------

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      setContent(text);
      if (!name) {
        setName(file.name.replace(/\.[^.]+$/, ''));
      }
    } catch {
      setPollError('Failed to read file');
    }
  };

  // ---------------------------------------------------------------------------
  // Render: Step 1 - Input
  // ---------------------------------------------------------------------------

  const renderInput = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <DialogTitle>新建知识</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">Step 1 / 2 — 输入内容并提取知识</p>
        </div>
      </div>

      {pollError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{pollError}</p>
        </div>
      )}

      {/* Group & Source Type */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Group</Label>
          {showCustomGroup ? (
            <div className="flex gap-2">
              <Input
                placeholder="输入新分组名称"
                value={customGroup}
                onChange={(e) => setCustomGroup(e.target.value)}
                className="flex-1"
                autoFocus
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCustomGroup(false);
                  setCustomGroup('');
                }}
              >
                取消
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
              >
                {groups.length === 0 && (
                  <option value="default">default</option>
                )}
                {groups.map((g) => (
                  <option key={g.id || g.name} value={g.id || g.name}>
                    {g.id || g.name} ({g.count})
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCustomGroup(true)}
                title="创建新分组"
              >
                + 新建
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label>Source Type</Label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="text">Text</option>
            <option value="message">Message</option>
            <option value="json">JSON</option>
          </select>
        </div>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label>Name (optional)</Label>
        <Input
          placeholder="Auto-generated from content if empty"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Input mode toggle */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            inputMode === 'text'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setInputMode('text')}
        >
          <Type className="h-4 w-4" />
          粘贴文本
        </button>
        <button
          type="button"
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            inputMode === 'file'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setInputMode('file')}
        >
          <Upload className="h-4 w-4" />
          上传文件
        </button>
      </div>

      {/* Content area */}
      {inputMode === 'text' ? (
        <div className="space-y-2">
          <Label>Content</Label>
          <textarea
            className="min-h-[240px] w-full rounded-md border bg-background p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="粘贴或输入文本内容..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {content.length} characters
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Label>File</Label>
          <div
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer',
              fileName
                ? 'border-primary/30 bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/30',
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.json,.csv,.html,.xml,.yaml,.yml,.log,.py,.js,.ts,.tsx,.jsx"
              className="hidden"
              onChange={handleFileUpload}
            />
            {fileName ? (
              <>
                <FileText className="mb-2 h-10 w-10 text-primary" />
                <p className="text-sm font-medium">{fileName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {content.length} characters loaded — 点击重新选择
                </p>
              </>
            ) : (
              <>
                <Upload className="mb-2 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">点击选择文件</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  支持 .txt, .md, .json, .csv, .html, .xml 等文本文件
                </p>
              </>
            )}
          </div>
          {content && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">内容预览</Label>
              <pre className="max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                {content.slice(0, 1000)}
                {content.length > 1000 && '\n...'}
              </pre>
              <p className="text-xs text-muted-foreground">
                {content.length} characters
              </p>
            </div>
          )}
        </div>
      )}

      <Button
        className="w-full"
        onClick={handlePreview}
        disabled={!content.trim()}
      >
        Preview Extraction
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render: Step 1.5 - Processing
  // ---------------------------------------------------------------------------

  const renderProcessing = () => (
    <div className="space-y-4">
      <div>
        <DialogTitle>新建知识</DialogTitle>
        <p className="text-sm text-muted-foreground mt-1">Processing...</p>
      </div>

      <div className="space-y-3 py-4">
        {STAGES.map((s) => {
          const st = getStageStatus(s.key);
          return (
            <div
              key={s.key}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                st === 'active' && 'bg-primary/5',
              )}
            >
              {st === 'done' && (
                <Check className="h-4 w-4 shrink-0 text-green-600" />
              )}
              {st === 'active' && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              )}
              {st === 'pending' && (
                <div className="h-4 w-4 shrink-0 rounded-full border-2 border-muted" />
              )}
              <span
                className={cn(
                  st === 'done' && 'text-muted-foreground line-through',
                  st === 'active' && 'font-medium text-foreground',
                  st === 'pending' && 'text-muted-foreground',
                )}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        预计需要 10-30 秒...
      </p>
      <div className="flex justify-center">
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render: Step 2 - Review
  // ---------------------------------------------------------------------------

  const renderReview = () => {
    if (!preview) return null;

    const activeNodes = preview.nodes.filter((n) => !excludedNodeIds.has(n.uuid));
    const activeEdges = preview.edges.filter((e) => !excludedEdgeIds.has(e.uuid));

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <DialogTitle>新建知识</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">Step 2 / 2 — 审查并确认</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setStep('input')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </div>

        {/* Original content */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Original Content</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {preview.episode.content}
            </pre>
          </CardContent>
        </Card>

        {/* Entities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Entities ({preview.nodes.length})
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {excludedNodeIds.size > 0 && `(${excludedNodeIds.size} excluded)`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {preview.nodes.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No entities extracted.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[25%]">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[15%]">Labels</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Summary</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground w-[80px]">Exclude</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.nodes.map((node) => {
                      const excluded = excludedNodeIds.has(node.uuid);
                      return (
                        <tr
                          key={node.uuid}
                          className={cn(
                            'border-b last:border-0 transition-colors',
                            excluded ? 'bg-muted/20 opacity-50' : 'hover:bg-muted/30',
                          )}
                        >
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{node.name}</span>
                              {node.is_new && (
                                <Badge variant="secondary" className="text-[10px]">NEW</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="flex flex-wrap gap-1">
                              {node.labels.map((l) => (
                                <Badge key={l} variant="outline" className="text-[10px]">
                                  {l}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground align-top">
                            {node.summary || '—'}
                          </td>
                          <td className="px-3 py-2 text-center align-top">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => toggleNode(node.uuid)}
                            >
                              {excluded ? (
                                <X className="h-4 w-4 text-destructive" />
                              ) : (
                                <Check className="h-4 w-4 text-green-600" />
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Relationships */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Relationships ({preview.edges.length})
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {excludedEdgeIds.size > 0 && `(${excludedEdgeIds.size} excluded)`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {preview.edges.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No relationships extracted.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[20%]">Source</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fact</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[20%]">Target</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground w-[80px]">Exclude</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.edges.map((edge) => {
                      const excluded = excludedEdgeIds.has(edge.uuid);
                      return (
                        <tr
                          key={edge.uuid}
                          className={cn(
                            'border-b last:border-0 transition-colors',
                            excluded ? 'bg-muted/20 opacity-50' : 'hover:bg-muted/30',
                          )}
                        >
                          <td className="px-3 py-2 font-medium align-top">{edge.source_node_name || edge.source_node_uuid.slice(0, 8)}</td>
                          <td className="px-3 py-2 text-muted-foreground align-top">{edge.fact || '—'}</td>
                          <td className="px-3 py-2 font-medium align-top">{edge.target_node_name || edge.target_node_uuid.slice(0, 8)}</td>
                          <td className="px-3 py-2 text-center align-top">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => toggleEdge(edge.uuid)}
                            >
                              {excluded ? (
                                <X className="h-4 w-4 text-destructive" />
                              ) : (
                                <Check className="h-4 w-4 text-green-600" />
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invalidated edges */}
        {preview.invalidated_edges.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-muted-foreground">
                Invalidated Edges ({preview.invalidated_edges.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {preview.invalidated_edges.map((e) => (
                  <li key={e.uuid} className="line-through">
                    {e.source_node_name} — {e.fact} — {e.target_node_name}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep('input')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Input
          </Button>
          <div className="text-right">
            <p className="mb-2 text-xs text-muted-foreground">
              {activeNodes.length} entities, {activeEdges.length} relationships to commit
            </p>
            <Button onClick={handleCommit} disabled={committing}>
              {committing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Committing...
                </>
              ) : (
                <>
                  <Check className="mr-1 h-4 w-4" />
                  Commit to Graph
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {step === 'input' && renderInput()}
        {step === 'processing' && renderProcessing()}
        {step === 'review' && renderReview()}
      </DialogContent>
    </Dialog>
  );
}
