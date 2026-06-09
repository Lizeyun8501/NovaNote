import { useState } from "react";
import type { FileTreeNode } from "../../types";

interface FileTreeProps {
  files: FileTreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  depth?: number;
}

export default function FileTree({
  files,
  selectedPath,
  onSelect,
  onRename,
  onDelete,
  depth = 0,
}: FileTreeProps) {
  return (
    <ul className="list-none m-0 p-0" role="tree">
      {files.map((node) => (
        <FileTreeNodeItem
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          depth={depth}
        />
      ))}
    </ul>
  );
}

function FileTreeNodeItem({
  node,
  selectedPath,
  onSelect,
  onRename,
  onDelete,
  depth,
}: {
  node: FileTreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleRename = () => {
    handleCloseContextMenu();
    const newName = prompt("Enter new name:", node.name);
    if (newName && newName !== node.name && newName.trim()) {
      // Build new path by replacing the basename in the path
      const parentPath = node.path.substring(0, node.path.lastIndexOf("/") + 1);
      const newPath = parentPath + newName.trim();
      onRename?.(node.path, newPath);
    }
  };

  const handleDelete = () => {
    handleCloseContextMenu();
    if (confirm(`Delete "${node.name}"? This action cannot be undone.`)) {
      onDelete?.(node.path);
    }
  };

  // Close context menu on any click outside
  const handleBlur = () => {
    setContextMenu(null);
  };

  if (node.is_dir) {
    return (
      <li role="treeitem" aria-expanded={expanded}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 w-full text-left px-2 py-1 rounded text-sm select-none hover:opacity-80"
          style={{
            paddingLeft: `${8 + depth * 12}px`,
            color: "var(--text-secondary)",
          }}
        >
          <span className="text-xs w-3 inline-block">
            {expanded ? "▼" : "▶"}
          </span>
          <span>📁</span>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children.length > 0 && (
          <FileTree
            files={node.children}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
            depth={depth + 1}
          />
        )}
      </li>
    );
  }

  // File node
  const isSelected = selectedPath === node.path;

  return (
    <li role="treeitem" aria-selected={isSelected}>
      <button
        onClick={() => onSelect(node.path)}
        onContextMenu={handleContextMenu}
        className="flex items-center gap-1 w-full text-left px-2 py-1 rounded text-sm select-none"
        style={{
          paddingLeft: `${8 + depth * 12 + 16}px`,
          color: isSelected
            ? "var(--accent)"
            : "var(--text-secondary)",
          backgroundColor: isSelected
            ? "var(--toolbar-active)"
            : "transparent",
        }}
      >
        <span>📄</span>
        <span className="truncate">{node.name}</span>
      </button>

      {/* Context menu */}
      {contextMenu && (
        <>
          {/* Backdrop to close on click outside */}
          <div
            className="fixed inset-0 z-40"
            onClick={handleCloseContextMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              handleCloseContextMenu();
            }}
          />
          <div
            className="fixed z-50 py-1 rounded shadow-lg border text-sm"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-color)",
            }}
            onBlur={handleBlur}
            tabIndex={-1}
            ref={(el) => el?.focus()}
          >
            <button
              onClick={handleRename}
              className="block w-full text-left px-4 py-1.5 hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: "var(--text-primary)" }}
            >
              Rename
            </button>
            <button
              onClick={handleDelete}
              className="block w-full text-left px-4 py-1.5 hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: "var(--text-primary)" }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  );
}