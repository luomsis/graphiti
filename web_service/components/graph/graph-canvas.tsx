// components/graph/graph-canvas.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Sigma from 'sigma';
import type Graph from 'graphology';
import { useGraphStore } from '@/stores/graph-store';
import type { GraphApiResponse } from '@/lib/types';
import { applyLayout } from '@/lib/graph-layouts';
import { NodeDetailPopover } from '@/components/graph/node-detail-popover';

interface GraphCanvasProps {
  className?: string;
  groupId?: string;
}

export function GraphCanvas({
  className,
  groupId,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);

  // Subscribe to graph data, layout algorithm, AND node count
  const graph = useGraphStore((s) => s.graph);
  const layoutAlgorithm = useGraphStore((s) => s.layoutAlgorithm);
  const nodeCount = useGraphStore((s) => s.nodeCount);
  const [loading, setLoading] = useState(true);

  // ---- Popover state (managed internally) ----
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const selectedNodeRef = useRef<string | null>(null);

  /** Convert a graph-space node position to absolute screen coords. */
  const getNodeScreenPos = useCallback(
    (nodeId: string): { x: number; y: number } | null => {
      const sigma = sigmaRef.current;
      const container = containerRef.current;
      if (!sigma || !container || !sigma.getGraph().hasNode(nodeId)) return null;
      const attrs = sigma.getGraph().getNodeAttributes(nodeId);
      const vp = sigma.graphToViewport({ x: attrs.x as number, y: attrs.y as number });
      const rect = container.getBoundingClientRect();
      return { x: rect.left + vp.x, y: rect.top + vp.y };
    },
    [],
  );

  // Load graph data when groupId changes
  useEffect(() => {
    async function loadGraph() {
      try {
        setLoading(true);
        const body: any = { limit: 500 };
        if (groupId) {
          body.group_ids = [groupId];
        }
        const res = await fetch('/api/graph/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data: GraphApiResponse = await res.json();
        useGraphStore.getState().loadGraph(data);
      } catch (err) {
        console.error('Failed to load graph:', err);
      } finally {
        setLoading(false);
      }
    }
    loadGraph();
  }, [groupId]);

  // Clear popover when graph changes (e.g. group switch or search focus)
  useEffect(() => {
    setSelectedNode(null);
    setPopoverPos(null);
    selectedNodeRef.current = null;
  }, [graph]);

  // Global click listener: close popover when clicking outside canvas & popover
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!selectedNodeRef.current) return;
      const target = e.target as HTMLElement;
      // Ignore clicks inside the popover itself
      if (target.closest('[data-popover="true"]')) return;
      // Ignore clicks on the Sigma canvas (handled by Sigma events)
      if (target.closest('canvas') || target.tagName === 'CANVAS') return;
      // Any other DOM click → close popover
      setSelectedNode(null);
      setPopoverPos(null);
      selectedNodeRef.current = null;
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Initialize Sigma renderer — only re-run when graph changes
  useEffect(() => {
    if (!containerRef.current || !graph) return;

    // Clean up previous instance
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    // Apply initial layout before rendering
    const currentLayout = useGraphStore.getState().layoutAlgorithm;
    applyLayout(graph, currentLayout);

    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: graph.order < 2000,
      defaultEdgeType: 'arrow',
      labelFont: 'Inter, system-ui, sans-serif',
      labelSize: 12,
      labelRenderedSizeThreshold: 6,
      minCameraRatio: 0.1,
      maxCameraRatio: 10,
    });

    sigmaRef.current = sigma;

    // Auto-center camera after initial render
    sigma.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });

    // ---- Single click → show popover ----
    sigma.on('clickNode', ({ node, event, preventSigmaDefault }) => {
      preventSigmaDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const screenX = rect.left + (event.x ?? 0);
      const screenY = rect.top + (event.y ?? 0);
      setSelectedNode(node);
      setPopoverPos({ x: screenX, y: screenY });
      selectedNodeRef.current = node;
    });

    // ---- Double click → expand neighbors (silent if none) ----
    sigma.on('doubleClickNode', async ({ node }) => {
      try {
        const res = await fetch(
          `/api/graph/entities/${node}/neighbors?depth=1`,
        );
        const data = await res.json();
        useGraphStore
          .getState()
          .expandNeighbors(node, data.nodes, data.edges);
      } catch (err) {
        console.error('Failed to expand neighbors:', err);
      }
    });

    // Hover → highlight
    sigma.on('enterNode', ({ node }) => {
      useGraphStore.getState().setHoveredNode(node);
    });
    sigma.on('leaveNode', () => {
      useGraphStore.getState().setHoveredNode(null);
    });

    // Click background → close popover
    sigma.on('clickStage', () => {
      setSelectedNode(null);
      setPopoverPos(null);
      selectedNodeRef.current = null;
    });

    // ---- Track popover position when camera moves (pan/zoom) ----
    sigma.getCamera().on('updated', () => {
      if (selectedNodeRef.current) {
        const pos = getNodeScreenPos(selectedNodeRef.current);
        if (pos) setPopoverPos(pos);
      }
    });

    // ---- Track popover position during layout animations ----
    sigma.on('afterRender', () => {
      if (selectedNodeRef.current) {
        const pos = getNodeScreenPos(selectedNodeRef.current);
        if (pos) setPopoverPos(pos);
      }
    });

    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [graph, getNodeScreenPos]);

  // Re-apply layout when layoutAlgorithm changes (without recreating Sigma)
  useEffect(() => {
    if (!graph || !sigmaRef.current) return;
    applyLayout(graph, layoutAlgorithm);
    sigmaRef.current.refresh();
    // Reset camera to center the graph after layout change
    sigmaRef.current.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
  }, [layoutAlgorithm, graph]);

  // Re-apply layout when nodeCount changes (e.g. after expandNeighbors adds nodes).
  // The graph reference doesn't change on in-place mutation, so we need this
  // separate effect to detect new nodes being added.
  // IMPORTANT: only fire for in-place mutations, NOT full graph replacements
  // (those are handled by the Sigma init effect above).
  const prevNodeCountRef = useRef<number>(0);
  const prevGraphRef = useRef<Graph | null>(null);
  useEffect(() => {
    if (!graph || !sigmaRef.current) return;
    const graphChanged = graph !== prevGraphRef.current;
    prevGraphRef.current = graph;

    if (graphChanged) {
      // Graph was fully replaced — Sigma init effect already handles layout
      prevNodeCountRef.current = nodeCount;
      return;
    }
    // Same graph reference, but nodeCount changed → in-place mutation (expandNeighbors)
    if (nodeCount === prevNodeCountRef.current) return;
    prevNodeCountRef.current = nodeCount;

    // Re-run layout to integrate new nodes, then refresh Sigma
    applyLayout(graph, layoutAlgorithm);
    sigmaRef.current.refresh();
    // Adjust camera to fit the expanded graph
    sigmaRef.current.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
  }, [nodeCount, graph, layoutAlgorithm]);

  const handleClosePopover = useCallback(() => {
    setSelectedNode(null);
    setPopoverPos(null);
    selectedNodeRef.current = null;
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">加载图谱中...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className={className || 'h-full w-full'} />
      {selectedNode && popoverPos &&
        createPortal(
          <NodeDetailPopover
            nodeId={selectedNode}
            x={popoverPos.x}
            y={popoverPos.y}
            onClose={handleClosePopover}
          />,
          document.body,
        )}
    </>
  );
}
