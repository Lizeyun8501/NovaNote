import { useState } from "react";
import { useTranslation } from "react-i18next";
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

  const { t } = useTranslation();

  const handleRename = () => {
    handleCloseContextMenu();
    const newName = prompt(t("common.enterNewName"), node.name);
    if (newName && newName !== node.name && newName.trim()) {
      // Build new path by replacing the basename in the path
      const parentPath = node.path.substring(0, node.path.lastIndexOf("/") + 1);
      const newPath = parentPath + newName.trim();
      onRename?.(node.path, newPath);
    }
  };

  const handleDelete = () => {
    handleCloseContextMenu();
    if (confirm(t("common.deleteConfirm", { name: node.name }))) {
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
          className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md text-sm select-none transition-all duration-150 hover:opacity-80"
          style={{
            paddingLeft: `${8 + depth * 12}px`,
            color: "var(--text-secondary)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 transition-transform duration-150" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: "var(--accent)" }}>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="truncate font-medium">{node.name}</span>
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
        className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md text-sm select-none transition-all duration-150"
        style={{
          paddingLeft: `${8 + depth * 12 + 28}px`,
          color: isSelected
            ? "var(--accent)"
            : "var(--text-secondary)",
          backgroundColor: isSelected
            ? "var(--toolbar-active)"
            : "transparent",
          fontWeight: isSelected ? 500 : 400,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          {node.path.endsWith(".canvas") ? (
            <>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </>
          ) : (
            <>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </>
          )}
        </svg>
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
              {t("common.rename")}
            </button>
            <button
              onClick={handleDelete}
              className="block w-full text-left px-4 py-1.5 hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: "var(--text-primary)" }}
            >
              {t("common.delete")}
            </button>
          </div>
        </>
      )}
    </li>
  );
}