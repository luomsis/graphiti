// lib/graph-utils.ts

import Graph from 'graphology';
import type { GraphApiResponse, GraphNode, GraphEdge } from './types';
import { getNodeColor, getNodeSize } from './graph-theme';

export function buildGraph(data: GraphApiResponse): Graph {
  const graph = new Graph({ multi: true });

  data.nodes.forEach((node: GraphNode) => {
    if (!graph.hasNode(node.id)) {
      graph.addNode(node.id, {
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        label: node.attributes.name || node.label || node.id,
        color: getNodeColor(node.type),
        size: getNodeSize(node.attributes),
        nodeType: node.type,
        type: 'circle',  // Sigma renderer type (must be a known program)
        ...node.attributes,
      });
    }
  });

  data.edges.forEach((edge: GraphEdge) => {
    if (
      graph.hasNode(edge.source) &&
      graph.hasNode(edge.target) &&
      !graph.hasEdge(edge.source, edge.target)
    ) {
      graph.addEdge(edge.source, edge.target, {
        label: edge.fact || edge.label,
        color: '#94a3b8',
        size: 1,
      });
    }
  });

  return graph;
}

export function addNeighborNodes(
  graph: Graph,
  nodes: GraphNode[],
  edges: GraphEdge[],
  parentId: string,
): void {
  const parentPos = graph.getNodeAttributes(parentId);

  // Distribute new nodes evenly in a circle around the parent
  // instead of random positions for a cleaner initial placement.
  const newNodes = nodes.filter((n: GraphNode) => !graph.hasNode(n.id));
  const count = newNodes.length;
  newNodes.forEach((node: GraphNode, i: number) => {
    const angle = (2 * Math.PI * i) / Math.max(count, 1);
    const distance = 100;
    graph.addNode(node.id, {
      x: (parentPos.x || 500) + Math.cos(angle) * distance,
      y: (parentPos.y || 500) + Math.sin(angle) * distance,
      label: node.attributes.name || node.label || node.id,
      color: getNodeColor(node.type),
      size: getNodeSize(node.attributes),
      nodeType: node.type,
      type: 'circle',
      ...node.attributes,
    });
  });

  edges.forEach((edge: GraphEdge) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
    // For multi-graphs: allow multiple edges between same nodes,
    // but skip exact duplicates (same label).
    const label = edge.fact || edge.label;
    let isDuplicate = false;
    graph.forEachEdge(edge.source, edge.target, (_e: string, attrs: Record<string, unknown>) => {
      if (attrs.label === label) isDuplicate = true;
    });
    if (!isDuplicate) {
      graph.addEdge(edge.source, edge.target, {
        label,
        color: '#94a3b8',
        size: 1,
      });
    }
  });
}
