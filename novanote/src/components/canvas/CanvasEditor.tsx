import CanvasView from "./CanvasView";

interface CanvasEditorProps {
  canvasPath: string;
  onNavigateToNote?: (path: string) => void;
}

export default function CanvasEditor({ canvasPath, onNavigateToNote }: CanvasEditorProps) {
  return <CanvasView canvasPath={canvasPath} onNavigateToNote={onNavigateToNote} />;
}
