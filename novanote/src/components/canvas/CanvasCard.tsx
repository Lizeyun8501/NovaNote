import { useState, useRef, useEffect } from "react";

export interface CanvasNode {
  id: string;
  type: "text" | "note";
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  notePath?: string;
  color?: string;
}

interface CanvasCardProps {
  node: CanvasNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
  onResize: (id: string, newWidth: number, newHeight: number) => void;
  onDelete: (id: string) => void;
  onUpdateContent: (id: string, content: string) => void;
  onNavigateToNote: (path: string) => void;
  noteContent?: string;
}

export default function CanvasCard({
  node,
  isSelected,
  onSelect,
  onDragStart,
  onResize,
  onDelete,
  onUpdateContent,
  onNavigateToNote,
  noteContent,
}: CanvasCardProps) {
  const [editing, setEditing] = useState(false);
  const [localContent, setLocalContent] = useState(node.content ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizingRef = useRef(false);

  useEffect(() => {
    setLocalContent(node.content ?? "");
  }, [node.content]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editing]);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizingRef.current = true;

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = node.width;
    const startHeight = node.height;

    const handleMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = Math.max(120, startWidth + (ev.clientX - startX));
      const newHeight = Math.max(80, startHeight + (ev.clientY - startY));
      onResize(node.id, newWidth, newHeight);
    };

    const handleUp = () => {
      resizingRef.current = false;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const handleContentBlur = () => {
    setEditing(false);
    if (localContent !== (node.content ?? "")) {
      onUpdateContent(node.id, localContent);
    }
  };

  const handleContentKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setEditing(false);
    }
    e.stopPropagation();
  };

  const borderColor = node.color || (isSelected ? "var(--accent)" : "var(--border-color)");

  return (
    <div
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        border: `2px solid ${borderColor}`,
        borderRadius: "8px",
        backgroundColor: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: isSelected
          ? "0 0 0 2px var(--accent), 0 4px 12px rgba(0,0,0,0.15)"
          : "0 2px 8px rgba(0,0,0,0.1)",
        zIndex: isSelected ? 10 : 1,
        userSelect: "none",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 8px",
          backgroundColor: node.color || "var(--bg-secondary)",
          borderBottom: `1px solid var(--border-color)`,
          cursor: "grab",
          flexShrink: 0,
        }}
        onMouseDown={(e) => {
          if (e.button === 0) {
            e.preventDefault();
            onDragStart(node.id, e);
          }
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: node.color ? "#fff" : "var(--text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.type === "note" ? "📝 Note" : "📄 Text"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.id);
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: node.color ? "#fff" : "var(--text-muted)",
            fontSize: "14px",
            lineHeight: 1,
            padding: "0 2px",
          }}
          title="Delete card"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "8px",
          fontSize: "13px",
          color: "var(--text-primary)",
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (node.type === "text") {
            setEditing(true);
          } else if (node.notePath) {
            onNavigateToNote(node.notePath);
          }
        }}
      >
        {node.type === "text" ? (
          editing ? (
            <textarea
              ref={textareaRef}
              value={localContent}
              onChange={(e) => setLocalContent(e.target.value)}
              onBlur={handleContentBlur}
              onKeyDown={handleContentKeyDown}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                outline: "none",
                resize: "none",
                backgroundColor: "transparent",
                color: "var(--text-primary)",
                fontSize: "13px",
                fontFamily: "inherit",
                padding: 0,
              }}
            />
          ) : (
            <div
              style={{
                whiteSpace: "pre-wrap",
                minHeight: "20px",
                cursor: "text",
              }}
            >
              {node.content || (
                <span style={{ color: "var(--text-muted)" }}>
                  Double-click to edit...
                </span>
              )}
            </div>
          )
        ) : (
          <div style={{ cursor: "pointer" }}>
            {noteContent ? (
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  opacity: 0.8,
                  maxHeight: "100%",
                  overflow: "hidden",
                }}
              >
                {noteContent.slice(0, 500)}
                {noteContent.length > 500 ? "..." : ""}
              </div>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>
                {node.notePath
                  ? "Double-click to open note"
                  : "No note linked"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDownResize}
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: "14px",
          height: "14px",
          cursor: "nwse-resize",
          backgroundColor: "transparent",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          style={{ position: "absolute", bottom: 2, right: 2 }}
        >
          <line
            x1="12"
            y1="2"
            x2="2"
            y2="12"
            stroke="var(--text-muted)"
            strokeWidth="1"
          />
          <line
            x1="12"
            y1="6"
            x2="6"
            y2="12"
            stroke="var(--text-muted)"
            strokeWidth="1"
          />
        </svg>
      </div>
    </div>
  );
}
