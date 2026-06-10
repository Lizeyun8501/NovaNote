import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CanvasNode, CanvasEdge, CanvasData, CanvasViewport } from "./types";

interface CanvasViewProps {
  canvasPath: string;
  onNavigateToNote?: (path: string) => void;
}

type ToolMode = "select" | "text" | "rectangle" | "circle" | "connect" | "delete";

const DEFAULT_NODE_COLOR = "#3b82f6";
const DEFAULT_TEXT_COLOR = "#f59e0b";
const DEFAULT_SHAPE_WIDTH = 160;
const DEFAULT_SHAPE_HEIGHT = 100;
const DEFAULT_TEXT_WIDTH = 180;
const DEFAULT_TEXT_HEIGHT = 60;
const MIN_NODE_SIZE = 30;
const RESIZE_HANDLE_SIZE = 8;

function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateEdgeId(): string {
  return `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const EMPTY_CANVAS: CanvasData = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

export default function CanvasView({ canvasPath }: CanvasViewProps) {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<ToolMode>("select");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectMousePos, setConnectMousePos] = useState<{ x: number; y: number } | null>(null);

  // Drag state
  const isDragging = useRef(false);
  const dragNodeId = useRef<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Resize state
  const isResizing = useRef(false);
  const resizeNodeId = useRef<string | null>(null);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // Pan state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });

  // Save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[]; viewport: CanvasViewport }>({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  });

  // Load canvas data on mount
  useEffect(() => {
    async function loadCanvas() {
      try {
        const raw: string = await invoke("vault_read_canvas", {
          relativePath: canvasPath,
        });
        const data: CanvasData = raw ? JSON.parse(raw) : EMPTY_CANVAS;
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
        setViewport(data.viewport || { x: 0, y: 0, zoom: 1 });
      } catch (err) {
        console.error("Failed to load canvas:", err);
      }
    }
    loadCanvas();
  }, [canvasPath]);

  // Keep ref in sync
  useEffect(() => {
    dataRef.current = { nodes, edges, viewport };
  }, [nodes, edges, viewport]);

  // Debounced save
  const saveCanvas = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      try {
        const data: CanvasData = {
          nodes: dataRef.current.nodes,
          edges: dataRef.current.edges,
          viewport: dataRef.current.viewport,
        };
        await invoke("vault_write_canvas", {
          relativePath: canvasPath,
          data: JSON.stringify(data),
        });
      } catch (err) {
        console.error("Failed to save canvas:", err);
      }
    }, 500);
  }, [canvasPath]);

  // Auto-save on data changes
  useEffect(() => {
    saveCanvas();
  }, [nodes, edges, viewport, saveCanvas]);

  // Screen coords to canvas coords
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number, rect: DOMRect) => {
      return {
        x: (screenX - rect.left - viewport.x) / viewport.zoom,
        y: (screenY - rect.top - viewport.y) / viewport.zoom,
      };
    },
    [viewport],
  );

  // Find node at position
  const findNodeAt = useCallback(
    (cx: number, cy: number): CanvasNode | null => {
      // Iterate in reverse so topmost (last-drawn) node is found first
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.type === "shape" && n.shapeType === "circle") {
          const rx = n.width / 2;
          const ry = n.height / 2;
          const ncx = n.x + rx;
          const ncy = n.y + ry;
          const dx = (cx - ncx) / rx;
          const dy = (cy - ncy) / ry;
          if (dx * dx + dy * dy <= 1) return n;
        } else {
          if (cx >= n.x && cx <= n.x + n.width && cy >= n.y && cy <= n.y + n.height) {
            return n;
          }
        }
      }
      return null;
    },
    [nodes],
  );

  // Find edge at position (approximate)
  const findEdgeAt = useCallback(
    (cx: number, cy: number): CanvasEdge | null => {
      const threshold = 8;
      for (const edge of edges) {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (!sourceNode || !targetNode) continue;

        const sx = sourceNode.x + sourceNode.width / 2;
        const sy = sourceNode.y + sourceNode.height / 2;
        const tx = targetNode.x + targetNode.width / 2;
        const ty = targetNode.y + targetNode.height / 2;

        // Distance from point to line segment
        const dx = tx - sx;
        const dy = ty - sy;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;
        let t = ((cx - sx) * dx + (cy - sy) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = sx + t * dx;
        const py = sy + t * dy;
        const dist = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
        if (dist < threshold) return edge;
      }
      return null;
    },
    [edges, nodes],
  );

  // Add a new node
  const addNode = useCallback(
    (type: "text" | "shape", shapeType?: "rectangle" | "circle", cx?: number, cy?: number) => {
      const x = cx ?? 200 - viewport.x / viewport.zoom;
      const y = cy ?? 200 - viewport.y / viewport.zoom;
      const node: CanvasNode = {
        id: generateId(),
        type,
        x: x - (type === "text" ? DEFAULT_TEXT_WIDTH : DEFAULT_SHAPE_WIDTH) / 2,
        y: y - (type === "text" ? DEFAULT_TEXT_HEIGHT : DEFAULT_SHAPE_HEIGHT) / 2,
        width: type === "text" ? DEFAULT_TEXT_WIDTH : DEFAULT_SHAPE_WIDTH,
        height: type === "text" ? DEFAULT_TEXT_HEIGHT : DEFAULT_SHAPE_HEIGHT,
        content: type === "text" ? "Text" : "",
        color: type === "text" ? DEFAULT_TEXT_COLOR : DEFAULT_NODE_COLOR,
        shapeType: type === "shape" ? shapeType ?? "rectangle" : undefined,
      };
      setNodes((prev) => [...prev, node]);
      setSelectedNodeId(node.id);
      if (type === "text") {
        setEditingNodeId(node.id);
        setEditingText("Text");
      }
    },
    [viewport],
  );

  // Delete selected node/edge
  const deleteSelected = useCallback(() => {
    if (selectedNodeId) {
      setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
      setEdges((prev) => prev.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
      setEditingNodeId(null);
    } else if (selectedEdgeId) {
      setEdges((prev) => prev.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }, [selectedNodeId, selectedEdgeId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingNodeId) return; // Don't intercept while editing text
      if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
      }
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setConnectingFrom(null);
        setConnectMousePos(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelected, editingNodeId]);

  // Mouse handlers on the SVG container
  const svgRef = useRef<SVGSVGElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const canvasPos = screenToCanvas(e.clientX, e.clientY, rect);

      // Middle mouse button or Ctrl+left => pan
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y };
        e.preventDefault();
        return;
      }

      if (e.button !== 0) return;

      // Check resize handle on selected node
      if (selectedNodeId && !isResizing.current) {
        const node = nodes.find((n) => n.id === selectedNodeId);
        if (node) {
          const handleX = node.x + node.width;
          const handleY = node.y + node.height;
          const hx = (handleX * viewport.zoom + viewport.x);
          const hy = (handleY * viewport.zoom + viewport.y);
          const dist = Math.sqrt((e.clientX - rect.left - hx) ** 2 + (e.clientY - rect.top - hy) ** 2);
          if (dist < RESIZE_HANDLE_SIZE + 4) {
            isResizing.current = true;
            resizeNodeId.current = selectedNodeId;
            resizeStart.current = { x: e.clientX, y: e.clientY, w: node.width, h: node.height };
            e.preventDefault();
            return;
          }
        }
      }

      // Connect mode
      if (tool === "connect") {
        const hitNode = findNodeAt(canvasPos.x, canvasPos.y);
        if (hitNode) {
          if (!connectingFrom) {
            setConnectingFrom(hitNode.id);
            setSelectedNodeId(hitNode.id);
          } else if (connectingFrom !== hitNode.id) {
            // Check if edge already exists
            const exists = edges.some(
              (e) =>
                (e.source === connectingFrom && e.target === hitNode.id) ||
                (e.source === hitNode.id && e.target === connectingFrom),
            );
            if (!exists) {
              const newEdge: CanvasEdge = {
                id: generateEdgeId(),
                source: connectingFrom,
                target: hitNode.id,
              };
              setEdges((prev) => [...prev, newEdge]);
            }
            setConnectingFrom(null);
            setConnectMousePos(null);
          }
        }
        return;
      }

      // Delete mode
      if (tool === "delete") {
        const hitNode = findNodeAt(canvasPos.x, canvasPos.y);
        if (hitNode) {
          setNodes((prev) => prev.filter((n) => n.id !== hitNode.id));
          setEdges((prev) => prev.filter((e) => e.source !== hitNode.id && e.target !== hitNode.id));
          if (selectedNodeId === hitNode.id) setSelectedNodeId(null);
        } else {
          const hitEdge = findEdgeAt(canvasPos.x, canvasPos.y);
          if (hitEdge) {
            setEdges((prev) => prev.filter((e) => e.id !== hitEdge.id));
            if (selectedEdgeId === hitEdge.id) setSelectedEdgeId(null);
          }
        }
        return;
      }

      // Text/shape placement mode
      if (tool === "text") {
        addNode("text", undefined, canvasPos.x, canvasPos.y);
        setTool("select");
        return;
      }
      if (tool === "rectangle") {
        addNode("shape", "rectangle", canvasPos.x, canvasPos.y);
        setTool("select");
        return;
      }
      if (tool === "circle") {
        addNode("shape", "circle", canvasPos.x, canvasPos.y);
        setTool("select");
        return;
      }

      // Select mode - try to select a node or edge
      const hitNode = findNodeAt(canvasPos.x, canvasPos.y);
      if (hitNode) {
        setSelectedNodeId(hitNode.id);
        setSelectedEdgeId(null);
        isDragging.current = true;
        dragNodeId.current = hitNode.id;
        dragOffset.current = { x: canvasPos.x - hitNode.x, y: canvasPos.y - hitNode.y };
        return;
      }

      const hitEdge = findEdgeAt(canvasPos.x, canvasPos.y);
      if (hitEdge) {
        setSelectedEdgeId(hitEdge.id);
        setSelectedNodeId(null);
        return;
      }

      // Clicked on empty space - deselect
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    },
    [svgRef, screenToCanvas, viewport, tool, nodes, edges, selectedNodeId, selectedEdgeId, connectingFrom, findNodeAt, findEdgeAt, addNode],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();

      // Panning
      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setViewport((v) => ({ ...v, x: panStart.current.vx + dx, y: panStart.current.vy + dy }));
        return;
      }

      // Resizing
      if (isResizing.current && resizeNodeId.current) {
        const dx = (e.clientX - resizeStart.current.x) / viewport.zoom;
        const dy = (e.clientY - resizeStart.current.y) / viewport.zoom;
        const newW = Math.max(MIN_NODE_SIZE, resizeStart.current.w + dx);
        const newH = Math.max(MIN_NODE_SIZE, resizeStart.current.h + dy);
        setNodes((prev) =>
          prev.map((n) => (n.id === resizeNodeId.current ? { ...n, width: newW, height: newH } : n)),
        );
        return;
      }

      // Dragging node
      if (isDragging.current && dragNodeId.current) {
        const canvasPos = screenToCanvas(e.clientX, e.clientY, rect);
        const newX = canvasPos.x - dragOffset.current.x;
        const newY = canvasPos.y - dragOffset.current.y;
        setNodes((prev) =>
          prev.map((n) => (n.id === dragNodeId.current ? { ...n, x: newX, y: newY } : n)),
        );
        return;
      }

      // Connect mode - track mouse for preview line
      if (tool === "connect" && connectingFrom) {
        const canvasPos = screenToCanvas(e.clientX, e.clientY, rect);
        setConnectMousePos(canvasPos);
      }
    },
    [screenToCanvas, viewport, tool, connectingFrom],
  );

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
    isDragging.current = false;
    dragNodeId.current = null;
    isResizing.current = false;
    resizeNodeId.current = null;
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const canvasPos = screenToCanvas(e.clientX, e.clientY, rect);

      const hitNode = findNodeAt(canvasPos.x, canvasPos.y);
      if (hitNode && hitNode.type === "text") {
        setEditingNodeId(hitNode.id);
        setEditingText(hitNode.content);
        return;
      }

      // Double-click on empty space creates a text node
      if (!hitNode) {
        addNode("text", undefined, canvasPos.x, canvasPos.y);
      }
    },
    [screenToCanvas, findNodeAt, addNode],
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewport((v) => {
      const newZoom = Math.max(0.1, Math.min(5, v.zoom * delta));
      // Zoom toward mouse position
      if (!svgRef.current) return { ...v, zoom: newZoom };
      const rect = svgRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const newX = mx - (mx - v.x) * (newZoom / v.zoom);
      const newY = my - (my - v.y) * (newZoom / v.zoom);
      return { x: newX, y: newY, zoom: newZoom };
    });
  }, []);

  // Finish editing text
  const finishEditing = useCallback(() => {
    if (editingNodeId) {
      setNodes((prev) =>
        prev.map((n) => (n.id === editingNodeId ? { ...n, content: editingText } : n)),
      );
      setEditingNodeId(null);
      setEditingText("");
    }
  }, [editingNodeId, editingText]);

  // Get edge path between two nodes
  const getEdgePath = useCallback(
    (edge: CanvasEdge): string | null => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (!sourceNode || !targetNode) return null;

      const sx = sourceNode.x + sourceNode.width / 2;
      const sy = sourceNode.y + sourceNode.height / 2;
      const tx = targetNode.x + targetNode.width / 2;
      const ty = targetNode.y + targetNode.height / 2;

      const dx = tx - sx;
      const cx = Math.abs(dx) * 0.4;

      return `M ${sx} ${sy} C ${sx + cx} ${sy}, ${tx - cx} ${ty}, ${tx} ${ty}`;
    },
    [nodes],
  );

  // Toolbar button style helper
  const toolBtnStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    borderRadius: "4px",
    fontSize: "12px",
    cursor: "pointer",
    border: "1px solid",
    borderColor: isActive ? "var(--accent-color, #3b82f6)" : "var(--border-color)",
    backgroundColor: isActive ? "var(--accent-color, #3b82f6)" : "var(--bg-hover)",
    color: isActive ? "#fff" : "var(--text-secondary)",
    transition: "all 0.15s ease",
  });

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-3 py-2 border-b shrink-0 flex-wrap"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
        }}
      >
        <button style={toolBtnStyle(tool === "select")} onClick={() => setTool("select")} title="Select (V)">
          &#x1F5B1; Select
        </button>
        <button style={toolBtnStyle(tool === "text")} onClick={() => setTool("text")} title="Add Text (T)">
          &#x270E; Text
        </button>
        <button style={toolBtnStyle(tool === "rectangle")} onClick={() => setTool("rectangle")} title="Add Rectangle">
          &#x25A0; Rect
        </button>
        <button style={toolBtnStyle(tool === "circle")} onClick={() => setTool("circle")} title="Add Circle">
          &#x25CF; Circle
        </button>
        <button style={toolBtnStyle(tool === "connect")} onClick={() => { setTool("connect"); setConnectingFrom(null); setConnectMousePos(null); }} title="Connect nodes">
          &#x2194; Connect
        </button>
        <button style={toolBtnStyle(tool === "delete")} onClick={() => setTool("delete")} title="Delete">
          &#x1F5D1; Delete
        </button>

        <div style={{ width: "1px", height: "20px", backgroundColor: "var(--border-color)", margin: "0 4px" }} />

        <button
          style={toolBtnStyle(false)}
          onClick={() => setViewport((v) => ({ ...v, zoom: Math.min(5, v.zoom * 1.2) }))}
          title="Zoom In"
        >
          +
        </button>
        <span className="text-xs px-1" style={{ color: "var(--text-muted)", minWidth: "40px", textAlign: "center" }}>
          {Math.round(viewport.zoom * 100)}%
        </span>
        <button
          style={toolBtnStyle(false)}
          onClick={() => setViewport((v) => ({ ...v, zoom: Math.max(0.1, v.zoom / 1.2) }))}
          title="Zoom Out"
        >
          &minus;
        </button>
        <button
          style={toolBtnStyle(false)}
          onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
          title="Reset View"
        >
          Reset
        </button>

        <div style={{ width: "1px", height: "20px", backgroundColor: "var(--border-color)", margin: "0 4px" }} />

        {selectedNode && (
          <>
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>Color:</label>
            <input
              type="color"
              value={selectedNode.color}
              onChange={(e) => {
                const newColor = e.target.value;
                setNodes((prev) =>
                  prev.map((n) => (n.id === selectedNodeId ? { ...n, color: newColor } : n)),
                );
              }}
              style={{ width: "24px", height: "24px", cursor: "pointer", border: "none", padding: 0, background: "none" }}
            />
          </>
        )}

        <div className="flex-1" />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {nodes.length} nodes, {edges.length} edges
        </span>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-hidden relative">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{
            backgroundColor: "var(--bg-primary)",
            cursor:
              tool === "delete"
                ? "crosshair"
                : tool === "connect"
                  ? "crosshair"
                  : tool === "text" || tool === "rectangle" || tool === "circle"
                    ? "cell"
                    : isPanning.current
                      ? "grabbing"
                      : "default",
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Grid pattern */}
          <defs>
            <pattern
              id="canvas-grid"
              width={20 * viewport.zoom}
              height={20 * viewport.zoom}
              patternUnits="userSpaceOnUse"
              x={viewport.x % (20 * viewport.zoom)}
              y={viewport.y % (20 * viewport.zoom)}
            >
              <circle cx="1" cy="1" r="0.5" fill="var(--border-color)" opacity="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#canvas-grid)" />

          <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
            {/* Edges */}
            {edges.map((edge) => {
              const path = getEdgePath(edge);
              if (!path) return null;
              const isSelected = edge.id === selectedEdgeId;
              return (
                <g key={edge.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke={isSelected ? "var(--accent-color, #3b82f6)" : "var(--text-muted)"}
                    strokeWidth={isSelected ? 3 : 2}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tool === "select") {
                        setSelectedEdgeId(edge.id);
                        setSelectedNodeId(null);
                      }
                    }}
                  />
                  {edge.label && (
                    <text
                      x={
                        (nodes.find((n) => n.id === edge.source)!?.x +
                          nodes.find((n) => n.id === edge.source)!?.width / 2 +
                          nodes.find((n) => n.id === edge.target)!?.x +
                          nodes.find((n) => n.id === edge.target)!?.width / 2) /
                        2
                      }
                      y={
                        (nodes.find((n) => n.id === edge.source)!?.y +
                          nodes.find((n) => n.id === edge.source)!?.height / 2 +
                          nodes.find((n) => n.id === edge.target)!?.y +
                          nodes.find((n) => n.id === edge.target)!?.height / 2) /
                          2 -
                        8
                      }
                      textAnchor="middle"
                      fill="var(--text-secondary)"
                      fontSize="11"
                      style={{ pointerEvents: "none" }}
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Connect preview line */}
            {connectingFrom && connectMousePos && (() => {
              const sourceNode = nodes.find((n) => n.id === connectingFrom);
              if (!sourceNode) return null;
              const sx = sourceNode.x + sourceNode.width / 2;
              const sy = sourceNode.y + sourceNode.height / 2;
              return (
                <line
                  x1={sx}
                  y1={sy}
                  x2={connectMousePos.x}
                  y2={connectMousePos.y}
                  stroke="var(--accent-color, #3b82f6)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  style={{ pointerEvents: "none" }}
                />
              );
            })()}

            {/* Nodes */}
            {nodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              const isConnecting = node.id === connectingFrom;
              const strokeColor = isSelected
                ? "var(--accent-color, #3b82f6)"
                : isConnecting
                  ? "#10b981"
                  : "var(--border-color)";
              const strokeWidth = isSelected ? 2.5 : 1.5;

              return (
                <g
                  key={node.id}
                  style={{ cursor: tool === "delete" ? "crosshair" : "grab" }}
                >
                  {/* Shape body */}
                  {node.type === "shape" && node.shapeType === "circle" ? (
                    <ellipse
                      cx={node.x + node.width / 2}
                      cy={node.y + node.height / 2}
                      rx={node.width / 2}
                      ry={node.height / 2}
                      fill={`${node.color}22`}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      style={{ cursor: tool === "delete" ? "crosshair" : "grab" }}
                    />
                  ) : (
                    <rect
                      x={node.x}
                      y={node.y}
                      width={node.width}
                      height={node.height}
                      rx={6}
                      fill={node.type === "text" ? `${node.color}18` : `${node.color}22`}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      style={{ cursor: tool === "delete" ? "crosshair" : "grab" }}
                    />
                  )}

                  {/* Text content */}
                  {node.type === "text" && (
                    editingNodeId === node.id ? (
                      <foreignObject
                        x={node.x + 4}
                        y={node.y + 4}
                        width={node.width - 8}
                        height={node.height - 8}
                      >
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <input
                            autoFocus
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onBlur={finishEditing}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") finishEditing();
                              if (e.key === "Escape") {
                                setEditingNodeId(null);
                                setEditingText("");
                              }
                            }}
                            style={{
                              width: "100%",
                              border: "none",
                              outline: "none",
                              background: "transparent",
                              color: "var(--text-primary)",
                              fontSize: "13px",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>
                      </foreignObject>
                    ) : (
                      <text
                        x={node.x + node.width / 2}
                        y={node.y + node.height / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="var(--text-primary)"
                        fontSize="13"
                        fontWeight="500"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {node.content.length > 20 ? node.content.slice(0, 20) + "\u2026" : node.content}
                      </text>
                    )
                  )}

                  {/* Shape label */}
                  {node.type === "shape" && node.content && (
                    <text
                      x={node.x + node.width / 2}
                      y={node.y + node.height / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="var(--text-primary)"
                      fontSize="12"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {node.content.length > 16 ? node.content.slice(0, 16) + "\u2026" : node.content}
                    </text>
                  )}

                  {/* Resize handle (bottom-right corner) */}
                  {isSelected && (
                    <rect
                      x={node.x + node.width - RESIZE_HANDLE_SIZE / 2}
                      y={node.y + node.height - RESIZE_HANDLE_SIZE / 2}
                      width={RESIZE_HANDLE_SIZE}
                      height={RESIZE_HANDLE_SIZE}
                      rx={2}
                      fill="var(--accent-color, #3b82f6)"
                      stroke="#fff"
                      strokeWidth={1}
                      style={{ cursor: "nwse-resize" }}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
