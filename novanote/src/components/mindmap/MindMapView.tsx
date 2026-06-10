import { useState, useMemo, useCallback, useRef } from "react";

interface MindMapNode {
  id: string;
  text: string;
  children: MindMapNode[];
  collapsed: boolean;
  level: number;
}

interface MindMapViewProps {
  content: string;
  onClose: () => void;
}

function parseContentToTree(content: string): MindMapNode {
  const lines = content.split("\n");
  const root: MindMapNode = { id: "root", text: "Root", children: [], collapsed: false, level: 0 };
  const stack: { node: MindMapNode; level: number }[] = [{ node: root, level: -1 }];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let level = 0;
    let text = trimmed;

    // Parse heading levels
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      level = headingMatch[1].length;
      text = headingMatch[2];
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      // List item
      level = 7; // Below headings
      text = trimmed.slice(2);
    } else {
      continue;
    }

    const node: MindMapNode = { id: `node-${Math.random().toString(36).slice(2, 8)}`, text, children: [], collapsed: false, level };

    // Find parent
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, level });
  }

  // If root has only one child, promote it
  if (root.children.length === 1) {
    return root.children[0];
  }
  // Use first heading as root text
  if (root.children.length > 0) {
    root.text = root.children[0].text;
    const firstChild = root.children.shift()!;
    root.children = [...firstChild.children, ...root.children];
  }

  return root;
}

interface LayoutNode {
  id: string;
  text: string;
  x: number;
  y: number;
  children: LayoutNode[];
  collapsed: boolean;
}

function layoutTree(node: MindMapNode, x: number, y: number, hSpacing: number, vSpacing: number): { layout: LayoutNode; height: number } {
  const visibleChildren = node.collapsed ? [] : node.children;

  if (visibleChildren.length === 0) {
    return {
      layout: { id: node.id, text: node.text, x, y, children: [], collapsed: node.collapsed },
      height: vSpacing,
    };
  }

  let childY = y - (visibleChildren.length - 1) * vSpacing / 2;
  const childLayouts: LayoutNode[] = [];
  let totalHeight = 0;

  for (const child of visibleChildren) {
    const { layout, height } = layoutTree(child, x + hSpacing, childY, hSpacing, vSpacing);
    childLayouts.push(layout);
    childY += height;
    totalHeight += height;
  }

  // Center parent vertically among children
  const centerY = (childLayouts[0].y + childLayouts[childLayouts.length - 1].y) / 2;

  return {
    layout: { id: node.id, text: node.text, x, y: centerY, children: childLayouts, collapsed: node.collapsed },
    height: Math.max(totalHeight, vSpacing),
  };
}

function collectEdges(layout: LayoutNode): Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> {
  const edges: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
  for (const child of layout.children) {
    edges.push({ from: { x: layout.x, y: layout.y }, to: { x: child.x, y: child.y } });
    edges.push(...collectEdges(child));
  }
  return edges;
}

function collectNodes(layout: LayoutNode): LayoutNode[] {
  const nodes = [layout];
  for (const child of layout.children) {
    nodes.push(...collectNodes(child));
  }
  return nodes;
}

const NODE_WIDTH = 140;
const NODE_HEIGHT = 36;
const H_SPACING = 200;
const V_SPACING = 56;

export default function MindMapView({ content, onClose }: MindMapViewProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 100, y: 300 });
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const tree = useMemo(() => parseContentToTree(content), [content]);

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const applyCollapsed = useCallback((node: MindMapNode): MindMapNode => {
    return {
      ...node,
      collapsed: collapsedNodes.has(node.id) || node.collapsed,
      children: node.children.map(c => applyCollapsed(c)),
    };
  }, [collapsedNodes]);

  const displayTree = useMemo(() => applyCollapsed(tree), [tree, applyCollapsed]);

  const { edges, nodes } = useMemo(() => {
    const { layout } = layoutTree(displayTree, 0, 0, H_SPACING, V_SPACING);
    return {
      edges: collectEdges(layout),
      nodes: collectNodes(layout),
    };
  }, [displayTree]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(3, z * delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-secondary)" }}
      >
        <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Mind Map</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(z => Math.min(3, z * 1.2))}
            className="px-2 py-1 rounded text-xs"
            style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}
          >+</button>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.max(0.2, z / 1.2))}
            className="px-2 py-1 rounded text-xs"
            style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}
          >−</button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 100, y: 300 }); }}
            className="px-2 py-1 rounded text-xs"
            style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}
          >Reset</button>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded text-xs"
            style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}
          >✕ Close</button>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          width="100%"
          height="100%"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {edges.map((edge, i) => (
              <path
                key={`edge-${i}`}
                d={`M ${edge.from.x} ${edge.from.y} C ${edge.from.x + 60} ${edge.from.y}, ${edge.to.x - 60} ${edge.to.y}, ${edge.to.x} ${edge.to.y}`}
                fill="none"
                stroke="var(--border-color)"
                strokeWidth="2"
              />
            ))}

            {/* Nodes */}
            {nodes.map((node) => (
              <g key={node.id} transform={`translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`}>
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={8}
                  fill="var(--bg-secondary)"
                  stroke="var(--border-color)"
                  strokeWidth="1"
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleCollapse(node.id)}
                />
                <text
                  x={NODE_WIDTH / 2}
                  y={NODE_HEIGHT / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--text-primary)"
                  fontSize="12"
                  fontWeight="500"
                  style={{ pointerEvents: "none" }}
                >
                  {node.text.length > 16 ? node.text.slice(0, 16) + "…" : node.text}
                </text>
                {/* Collapse indicator */}
                {(tree.children.length > 0 || node.children.length > 0) && (
                  <circle
                    cx={NODE_WIDTH + 6}
                    cy={NODE_HEIGHT / 2}
                    r={6}
                    fill="var(--accent-color, #3b82f6)"
                    style={{ cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }}
                  />
                )}
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
