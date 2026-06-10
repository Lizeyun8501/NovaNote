import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force";
import type {
  Simulation,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from "d3-force";
import { zoom, zoomIdentity } from "d3-zoom";
import type { D3ZoomEvent } from "d3-zoom";
import { select } from "d3-selection";

interface GraphNodeRaw {
  id: string;
  title: string;
  path: string;
}

interface GraphEdgeRaw {
  source: string;
  target: string;
}

interface GraphDataRaw {
  nodes: GraphNodeRaw[];
  edges: GraphEdgeRaw[];
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  title: string;
  path: string;
  connectionCount: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode | string;
  target: SimNode | string;
}

interface RenderNode {
  id: string;
  title: string;
  path: string;
  x: number;
  y: number;
  connectionCount: number;
}

interface RenderLink {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

interface GraphViewProps {
  onClose: () => void;
  onSelectNote: (path: string) => void;
}

export default function GraphView({ onClose, onSelectNote }: GraphViewProps) {
  const [nodes, setNodes] = useState<RenderNode[]>([]);
  const [links, setLinks] = useState<RenderLink[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const simLinksRef = useRef<SimLink[]>([]);
  const dragNodeRef = useRef<SimNode | null>(null);

  const width = window.innerWidth;
  const height = window.innerHeight;

  // Compute max connections for color scaling
  const maxConnections = nodes.reduce(
    (max, n) => Math.max(max, n.connectionCount),
    1
  );

  const getNodeColor = useCallback(
    (connectionCount: number) => {
      const ratio = connectionCount / maxConnections;
      // Interpolate from a dimmer accent to a brighter accent
      const r = Math.round(99 + ratio * (129 - 99));
      const g = Math.round(102 + ratio * (140 - 102));
      const b = Math.round(241 + ratio * (248 - 241));
      return `rgb(${r}, ${g}, ${b})`;
    },
    [maxConnections]
  );

  const getNodeRadius = useCallback(
    (connectionCount: number) => {
      return 6 + Math.min(connectionCount, 10) * 1.5;
    },
    []
  );

  // Determine if a node is highlighted (direct neighbor of selected)
  const isNodeHighlighted = useCallback(
    (nodeId: string) => {
      if (!highlightedId) return true;
      if (nodeId === highlightedId) return true;
      // Check if this node is a direct neighbor
      return simLinksRef.current.some((sl) => {
        const sourceId =
          typeof sl.source === "string" ? sl.source : (sl.source as SimNode).id;
        const targetId =
          typeof sl.target === "string" ? sl.target : (sl.target as SimNode).id;
        return (
          (sourceId === highlightedId && targetId === nodeId) ||
          (targetId === highlightedId && sourceId === nodeId)
        );
      });
    },
    [highlightedId]
  );

  const isLinkHighlighted = useCallback(
    (linkIdx: number) => {
      if (!highlightedId) return true;
      const sl = simLinksRef.current[linkIdx];
      if (!sl) return false;
      const sourceId =
        typeof sl.source === "string" ? sl.source : (sl.source as SimNode).id;
      const targetId =
        typeof sl.target === "string" ? sl.target : (sl.target as SimNode).id;
      return sourceId === highlightedId || targetId === highlightedId;
    },
    [highlightedId]
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchGraphData() {
      try {
        const data: GraphDataRaw = await invoke("vault_get_graph_data");
        if (cancelled) return;

        if (data.nodes.length === 0) {
          setLoading(false);
          return;
        }

        // Count connections per node
        const connectionCounts = new Map<string, number>();
        for (const n of data.nodes) {
          connectionCounts.set(n.id, 0);
        }
        for (const e of data.edges) {
          connectionCounts.set(
            e.source,
            (connectionCounts.get(e.source) || 0) + 1
          );
          connectionCounts.set(
            e.target,
            (connectionCounts.get(e.target) || 0) + 1
          );
        }

        // Create simulation nodes
        const simNodes: SimNode[] = data.nodes.map((n) => ({
          id: n.id,
          title: n.title,
          path: n.path,
          connectionCount: connectionCounts.get(n.id) || 0,
          x: width / 2 + (Math.random() - 0.5) * 200,
          y: height / 2 + (Math.random() - 0.5) * 200,
        }));

        // Create simulation links
        const simLinks: SimLink[] = data.edges.map((e) => ({
          source: e.source,
          target: e.target,
        }));

        simNodesRef.current = simNodes;
        simLinksRef.current = simLinks;

        // Create force simulation
        const simulation = forceSimulation<SimNode>(simNodes)
          .force(
            "link",
            forceLink<SimNode, SimLink>(simLinks)
              .id((d) => d.id)
              .distance(80)
          )
          .force("charge", forceManyBody().strength(-200))
          .force("center", forceCenter(width / 2, height / 2))
          .force("collide", forceCollide<SimNode>().radius((d) => getNodeRadius(d.connectionCount) + 4))
          .on("tick", () => {
            const renderNodes: RenderNode[] = simNodes.map((n) => ({
              id: n.id,
              title: n.title,
              path: n.path,
              x: n.x ?? 0,
              y: n.y ?? 0,
              connectionCount: n.connectionCount,
            }));
            const renderLinks: RenderLink[] = simLinks.map((l) => {
              const src = l.source as SimNode;
              const tgt = l.target as SimNode;
              return {
                sourceX: src.x ?? 0,
                sourceY: src.y ?? 0,
                targetX: tgt.x ?? 0,
                targetY: tgt.y ?? 0,
              };
            });
            setNodes(renderNodes);
            setLinks(renderLinks);
          });

        simulationRef.current = simulation;
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    }

    fetchGraphData();

    return () => {
      cancelled = true;
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Setup d3 zoom on SVG
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const g = svg.querySelector("g.graph-container") as SVGGElement;
    if (!g) return;
    gRef.current = g;

    const svgSelection = select<SVGSVGElement, unknown>(svg);

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        if (gRef.current) {
          gRef.current.setAttribute(
            "transform",
            event.transform.toString()
          );
        }
      });

    svgSelection.call(zoomBehavior);

    // Set initial transform to center
    const initialTransform = zoomIdentity.translate(0, 0).scale(1);
    zoomBehavior.transform(svgSelection, initialTransform);
  }, [nodes]);

  // Handle node click
  const handleNodeClick = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setHighlightedId((prev) => (prev === nodeId ? null : nodeId));
    },
    []
  );

  // Handle node double-click to navigate
  const handleNodeDoubleClick = useCallback(
    (path: string) => {
      onSelectNote(path);
      onClose();
    },
    [onSelectNote, onClose]
  );

  // Handle background click to clear highlight
  const handleBackgroundClick = useCallback(() => {
    setHighlightedId(null);
  }, []);

  // Handle node drag
  const handleNodeMouseDown = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();

      const simNode = simNodesRef.current.find((n) => n.id === nodeId);
      if (!simNode || !simulationRef.current) return;

      dragNodeRef.current = simNode;
      simulationRef.current.alphaTarget(0.3).restart();

      const svg = svgRef.current;
      if (!svg) return;

      const onMove = (ev: MouseEvent) => {
        if (!dragNodeRef.current || !gRef.current || !svgRef.current) return;

        const point = svgRef.current.createSVGPoint();
        point.x = ev.clientX;
        point.y = ev.clientY;

        // Get the current transform of the g element
        const transformAttr = gRef.current.getAttribute("transform");
        let tx = 0,
          ty = 0,
          scale = 1;
        if (transformAttr) {
          const match = transformAttr.match(
            /translate\(([^,]+),([^)]+)\)\s*scale\(([^)]+)\)/
          );
          if (match) {
            tx = parseFloat(match[1]);
            ty = parseFloat(match[2]);
            scale = parseFloat(match[3]);
          } else {
            const translateMatch = transformAttr.match(
              /translate\(([^,]+),([^)]+)\)/
            );
            if (translateMatch) {
              tx = parseFloat(translateMatch[1]);
              ty = parseFloat(translateMatch[2]);
            }
            const scaleMatch = transformAttr.match(/scale\(([^)]+)\)/);
            if (scaleMatch) {
              scale = parseFloat(scaleMatch[1]);
            }
          }
        }

        const svgX = (ev.clientX - svgRef.current.getBoundingClientRect().left - tx) / scale;
        const svgY = (ev.clientY - svgRef.current.getBoundingClientRect().top - ty) / scale;

        dragNodeRef.current.fx = svgX;
        dragNodeRef.current.fy = svgY;
      };

      const onUp = () => {
        if (dragNodeRef.current) {
          dragNodeRef.current.fx = null;
          dragNodeRef.current.fy = null;
        }
        dragNodeRef.current = null;
        simulationRef.current?.alphaTarget(0);
        svg.removeEventListener("mousemove", onMove);
        svg.removeEventListener("mouseup", onUp);
      };

      svg.addEventListener("mousemove", onMove);
      svg.addEventListener("mouseup", onUp);
    },
    []
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "var(--bg-primary)",
      }}
    >
      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Knowledge Graph
        </h2>
        <button
          onClick={onClose}
          style={{
            padding: "6px 16px",
            borderRadius: "6px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-primary)",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          Close
        </button>
      </div>

      {/* SVG Canvas */}
      {loading ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-muted)",
            fontSize: "16px",
          }}
        >
          Loading graph data...
        </div>
      ) : error ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-muted)",
            fontSize: "16px",
          }}
        >
          Error: {error}
        </div>
      ) : nodes.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-muted)",
            fontSize: "16px",
          }}
        >
          No notes found. Open a vault and create some notes first.
        </div>
      ) : (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ cursor: "grab" }}
          onClick={handleBackgroundClick}
        >
          <g className="graph-container">
            {/* Links */}
            {links.map((link, i) => {
              const highlighted = isLinkHighlighted(i);
              return (
                <line
                  key={i}
                  x1={link.sourceX}
                  y1={link.sourceY}
                  x2={link.targetX}
                  y2={link.targetY}
                  stroke={highlighted ? "var(--accent)" : "var(--border-color)"}
                  strokeWidth={highlighted ? 1.5 : 0.5}
                  opacity={highlighted ? 0.8 : 0.2}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const highlighted = isNodeHighlighted(node.id);
              const radius = getNodeRadius(node.connectionCount);
              const color = getNodeColor(node.connectionCount);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => handleNodeClick(node.id, e)}
                  onDoubleClick={() => handleNodeDoubleClick(node.path)}
                  onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    r={radius}
                    fill={color}
                    opacity={highlighted ? 1 : 0.2}
                    stroke={
                      highlightedId === node.id
                        ? "var(--text-primary)"
                        : "none"
                    }
                    strokeWidth={highlightedId === node.id ? 2 : 0}
                  />
                  {highlighted && (
                    <text
                      textAnchor="middle"
                      dy={radius + 14}
                      fill="var(--text-primary)"
                      fontSize="11px"
                      fontWeight={500}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {node.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
