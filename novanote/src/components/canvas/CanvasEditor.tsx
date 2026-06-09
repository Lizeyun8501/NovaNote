import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import CanvasCard from "./CanvasCard";
import type { CanvasNode } from "./CanvasCard";

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: "top" | "bottom" | "left" | "right";
  toSide?: "top" | "bottom" | "left" | "right";
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

interface CanvasEditorProps {
  canvasPath: string;
  onNavigateToNote: (path: string) => void;
}

export default function CanvasEditor({
  canvasPath,
  onNavigateToNote,
}: CanvasEditorProps) {
  const [canvasData, setCanvasData] = useState<CanvasData>({
    nodes: [],
    edges: [],
  });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [panState, setPanState] = useState<{
    startX: number;
    startY: number;
    startTransX: number;
    startTransY: number;
  } | null>(null);
  const [noteContents, setNoteContents] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);
  const [linkTarget, setLinkTarget] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load canvas data on mount
  useEffect(() => {
    let cancelled = false;
    async function loadCanvas() {
      try {
        const raw = await invoke<string>("vault_read_canvas", {
          relativePath: canvasPath,
        });
        if (cancelled) return;
        const data: CanvasData = JSON.parse(raw);
        setCanvasData(data);
      } catch (err) {
        console.error("Failed to load canvas:", err);
        // Initialize with empty data
        setCanvasData({ nodes: [], edges: [] });
      }
    }
    loadCanvas();
    return () => {
      cancelled = true;
    };
  }, [canvasPath]);

  // Load note contents for note-type cards
  useEffect(() => {
    const noteNodes = canvasData.nodes.filter(
      (n) => n.type === "note" && n.notePath
    );
    for (const node of noteNodes) {
      if (!noteContents[node.id] && node.notePath) {
        invoke<string>("vault_read_note", {
          relativePath: node.notePath,
        })
          .then((content) => {
            setNoteContents((prev) => ({ ...prev, [node.id]: content }));
          })
          .catch(() => {
            // Note not found, ignore
          });
      }
    }
  }, [canvasData.nodes, noteContents]);

  // Debounced save
  const saveCanvas = useCallback(
    (data: CanvasData) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(async () => {
        try {
          await invoke("vault_write_canvas", {
            relativePath: canvasPath,
            data: JSON.stringify(data),
          });
        } catch (err) {
          console.error("Failed to save canvas:", err);
        }
      }, 500);
    },
    [canvasPath],
  );

  const updateCanvasData = useCallback(
    (updater: (prev: CanvasData) => CanvasData) => {
      setCanvasData((prev) => {
        const next = updater(prev);
        saveCanvas(next);
        return next;
      });
    },
    [saveCanvas],
  );

  // Pan: middle-click or Ctrl+left-click drag on background
  const handleBackgroundMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Close context menu on any click
      setContextMenu(null);

      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        e.preventDefault();
        setPanState({
          startX: e.clientX,
          startY: e.clientY,
          startTransX: transform.x,
          startTransY: transform.y,
        });
      } else if (e.button === 0) {
        // Left click on background deselects
        setSelectedNode(null);
      }
    },
    [transform],
  );

  // Handle mouse move for panning and dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (panState) {
        const dx = e.clientX - panState.startX;
        const dy = e.clientY - panState.startY;
        setTransform((prev) => ({
          ...prev,
          x: panState.startTransX + dx,
          y: panState.startTransY + dy,
        }));
      }
      if (dragState) {
        const dx = (e.clientX - dragState.startX) / transform.scale;
        const dy = (e.clientY - dragState.startY) / transform.scale;
        updateCanvasData((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === dragState.nodeId
              ? { ...n, x: dragState.offsetX + dx, y: dragState.offsetY + dy }
              : n,
          ),
        }));
      }
    };

    const handleMouseUp = () => {
      setPanState(null);
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [panState, dragState, transform.scale, updateCanvasData]);

  // Zoom: mouse wheel
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setTransform((prev) => ({
        ...prev,
        scale: Math.min(5, Math.max(0.1, prev.scale + delta)),
      }));
    },
    [],
  );

  // Double-click on empty space: create a new text card
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== containerRef.current) return;

      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;

      const newNode: CanvasNode = {
        id: `node-${Date.now()}`,
        type: "text",
        x,
        y,
        width: 200,
        height: 150,
        content: "",
      };

      updateCanvasData((prev) => ({
        ...prev,
        nodes: [...prev.nodes, newNode],
      }));
    },
    [transform, updateCanvasData],
  );

  // Card drag start
  const handleCardDragStart = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      const node = canvasData.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setDragState({
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: node.x,
        offsetY: node.y,
      });
      setSelectedNode(nodeId);
    },
    [canvasData.nodes],
  );

  // Card resize
  const handleCardResize = useCallback(
    (nodeId: string, newWidth: number, newHeight: number) => {
      updateCanvasData((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === nodeId ? { ...n, width: newWidth, height: newHeight } : n,
        ),
      }));
    },
    [updateCanvasData],
  );

  // Card delete
  const handleCardDelete = useCallback(
    (nodeId: string) => {
      updateCanvasData((prev) => ({
        nodes: prev.nodes.filter((n) => n.id !== nodeId),
        edges: prev.edges.filter(
          (e) => e.fromNode !== nodeId && e.toNode !== nodeId,
        ),
      }));
      setSelectedNode(null);
    },
    [updateCanvasData],
  );

  // Card content update
  const handleCardContentUpdate = useCallback(
    (nodeId: string, content: string) => {
      updateCanvasData((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === nodeId ? { ...n, content } : n,
        ),
      }));
    },
    [updateCanvasData],
  );

  // Context menu for linking note
  const handleCardContextMenu = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
    },
    [],
  );

  // Link a note to a card
  const handleLinkNote = useCallback(async () => {
    if (!contextMenu) return;
    const target = linkTarget?.trim();
    if (!target) return;

    const notePath = target.endsWith(".md") ? target : `${target}.md`;

    updateCanvasData((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === contextMenu.nodeId
          ? { ...n, type: "note" as const, notePath }
          : n,
      ),
    }));

    setContextMenu(null);
    setLinkTarget(null);
  }, [contextMenu, linkTarget, updateCanvasData]);

  // Add edge between two selected nodes
  const handleAddEdge = useCallback(() => {
    if (!selectedNode) return;
    // For MVP: connect selected node to the most recently created other node
    const otherNodes = canvasData.nodes.filter(
      (n) => n.id !== selectedNode,
    );
    if (otherNodes.length === 0) return;

    // Use the last other node
    const toNode = otherNodes[otherNodes.length - 1];

    // Check if edge already exists
    const exists = canvasData.edges.some(
      (e) =>
        (e.fromNode === selectedNode && e.toNode === toNode.id) ||
        (e.fromNode === toNode.id && e.toNode === selectedNode),
    );
    if (exists) return;

    const newEdge: CanvasEdge = {
      id: `edge-${Date.now()}`,
      fromNode: selectedNode,
      toNode: toNode.id,
    };

    updateCanvasData((prev) => ({
      ...prev,
      edges: [...prev.edges, newEdge],
    }));
  }, [selectedNode, canvasData, updateCanvasData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNode && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
          handleCardDelete(selectedNode);
        }
      }
      if (e.key === "e" && e.ctrlKey && selectedNode) {
        e.preventDefault();
        handleAddEdge();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNode, handleCardDelete, handleAddEdge]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "var(--bg-primary)",
        cursor: panState ? "grabbing" : "default",
      }}
      onMouseDown={handleBackgroundMouseDown}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      {/* Canvas content with transform */}
      <div
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {/* Grid dots for visual reference */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "10000px",
            height: "10000px",
            backgroundImage:
              "radial-gradient(circle, var(--border-color) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            pointerEvents: "none",
            opacity: 0.5,
          }}
        />

        {/* SVG for edges */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "10000px",
            height: "10000px",
            pointerEvents: "none",
          }}
        >
          {canvasData.edges.map((edge) => {
            const from = canvasData.nodes.find(
              (n) => n.id === edge.fromNode,
            );
            const to = canvasData.nodes.find(
              (n) => n.id === edge.toNode,
            );
            if (!from || !to) return null;
            return (
              <line
                key={edge.id}
                x1={from.x + from.width / 2}
                y1={from.y + from.height / 2}
                x2={to.x + to.width / 2}
                y2={to.y + to.height / 2}
                stroke="var(--accent)"
                strokeWidth={2}
                opacity={0.6}
              />
            );
          })}
        </svg>

        {/* Cards */}
        {canvasData.nodes.map((node) => (
          <div
            key={node.id}
            onContextMenu={(e) => handleCardContextMenu(e, node.id)}
          >
            <CanvasCard
              node={node}
              isSelected={selectedNode === node.id}
              onSelect={setSelectedNode}
              onDragStart={handleCardDragStart}
              onResize={handleCardResize}
              onDelete={handleCardDelete}
              onUpdateContent={handleCardContentUpdate}
              onNavigateToNote={onNavigateToNote}
              noteContent={
                node.type === "note" ? noteContents[node.id] : undefined
              }
            />
          </div>
        ))}
      </div>

      {/* Zoom indicator */}
      <div
        style={{
          position: "absolute",
          bottom: "12px",
          right: "12px",
          padding: "4px 10px",
          borderRadius: "4px",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          fontSize: "12px",
          color: "var(--text-muted)",
          pointerEvents: "none",
        }}
      >
        {Math.round(transform.scale * 100)}%
      </div>

      {/* Help text */}
      <div
        style={{
          position: "absolute",
          bottom: "12px",
          left: "12px",
          padding: "4px 10px",
          borderRadius: "4px",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          fontSize: "11px",
          color: "var(--text-muted)",
          pointerEvents: "none",
        }}
      >
        Double-click: add card | Scroll: zoom | Ctrl+drag / Middle-drag: pan |
        Ctrl+E: add edge
      </div>

      {/* Context menu for linking note */}
      {contextMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => {
              setContextMenu(null);
              setLinkTarget(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
              setLinkTarget(null);
            }}
          />
          <div
            style={{
              position: "fixed",
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
              zIndex: 50,
              padding: "8px",
              borderRadius: "6px",
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              minWidth: "200px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              Link to Note
            </div>
            <input
              type="text"
              placeholder="Note path (e.g. notes/my-note.md)"
              value={linkTarget ?? ""}
              onChange={(e) => setLinkTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleLinkNote();
                }
                e.stopPropagation();
              }}
              style={{
                width: "100%",
                padding: "4px 8px",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
                fontSize: "12px",
                outline: "none",
                boxSizing: "border-box",
              }}
              autoFocus
            />
            <button
              onClick={handleLinkNote}
              style={{
                padding: "4px 8px",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                backgroundColor: "var(--accent)",
                color: "#fff",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Link
            </button>
          </div>
        </>
      )}
    </div>
  );
}
