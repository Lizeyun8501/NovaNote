import ThemeToggle from "../theme/ThemeToggle";
import type { FileTreeNode } from "../../types";
import FileTree from "./FileTree";
import ActionBar from "./ActionBar";
import { useState } from "react";

interface SidebarProps {
  files: FileTreeNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onOpenVault: () => void;
  onNewNote: () => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
}

export default function Sidebar({
  files,
  selectedPath,
  onSelectFile,
  onOpenVault,
  onNewNote,
  onRename,
  onDelete,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="flex flex-col border-r h-screen"
      style={{
        backgroundColor: "var(--bg-sidebar)",
        borderColor: "var(--border-color)",
        width: collapsed ? "48px" : "260px",
        transition: "width 0.2s ease",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-3 border-b"
        style={{ borderColor: "var(--border-color)" }}
      >
        {!collapsed && (
          <h1
            className="text-base font-bold select-none"
            style={{ color: "var(--text-primary)" }}
          >
            NovaNote
          </h1>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && <ThemeToggle />}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="px-1 py-1 rounded text-base hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "☰" : "✕"}
          </button>
        </div>
      </div>

      {/* Action Bar */}
      {!collapsed && (
        <ActionBar onOpenVault={onOpenVault} onNewNote={onNewNote} />
      )}

      {/* File Tree */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {files.length === 0 ? (
            <p
              className="text-sm px-2 py-4 text-center"
              style={{ color: "var(--text-muted)" }}
            >
              No vault opened.
            </p>
          ) : (
            <FileTree
              files={files}
              selectedPath={selectedPath}
              onSelect={onSelectFile}
              onRename={onRename}
              onDelete={onDelete}
            />
          )}
        </div>
      )}
    </aside>
  );
}