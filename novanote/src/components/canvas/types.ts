export interface CanvasNode {
  id: string;
  type: "text" | "shape";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  color: string;
  shapeType?: "rectangle" | "circle";
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
}
