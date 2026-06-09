import ThemeToggle from "../theme/ThemeToggle";
import { SyncStatus } from "../sync/SyncStatus";
import type { FileTreeNode } from "../../types";
import FileTree from "./FileTree";
import ActionBar from "./ActionBar";
import TagsPanel from "../tags/TagsPanel";
import { useState } from "react";

interface SidebarProps {
  files: FileTreeNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onOpenVault: () => void;
  onNewNote: () => void;
  onNewCanvas?: () => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  selectedTag?: string | null;
  onSelectTag?: (tag: string) => void;
  onOpenDailyNote?: () => void;
  onOpenTemplateSelector?: () => void;
  onImport?: () => void;
  onSyncClick?: () => void;
  onOpenAI?: () => void;
  onOpenCalendar?: () => void;
  onOpenPlugins?: () => void;
}

export default function Sidebar({
  files,
  selectedPath,
  onSelectFile,
  onOpenVault,
  onNewNote,
  onNewCanvas,
  onRename,
  onDelete,
  collapsed: collapsedProp,
  onToggleCollapsed,
  selectedTag,
  onSelectTag,
  onOpenDailyNote,
  onOpenTemplateSelector,
  onImport,
  onSyncClick,
  onOpenAI,
  onOpenCalendar,
  onOpenPlugins,
}: SidebarProps) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const collapsed = collapsedProp ?? collapsedInternal;
  const toggleCollapsed = onToggleCollapsed ?? (() => setCollapsedInternal((prev) => !prev));

  const handleSelectTag = (tag: string) => {
    if (onSelectTag) {
      onSelectTag(selectedTag === tag ? "" : tag);
    }
  };

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
          {!collapsed && onSyncClick && (
            <button
              onClick={onSyncClick}
              className="border-none bg-transparent cursor-pointer p-0"
              title="Sync Settings"
            >
              <SyncStatus />
            </button>
          )}
          {!collapsed && <ThemeToggle />}
          <button
            onClick={toggleCollapsed}
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
        <ActionBar onOpenVault={onOpenVault} onNewNote={onNewNote} onNewCanvas={onNewCanvas} onOpenDailyNote={onOpenDailyNote} onOpenTemplateSelector={onOpenTemplateSelector} onImport={onImport} onOpenAI={onOpenAI} onOpenCalendar={onOpenCalendar} onOpenPlugins={onOpenPlugins} />
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

      {/* Tags Section */}
      {!collapsed && onSelectTag && (
        <div
          className="border-t"
          style={{ borderColor: "var(--border-color)" }}
        >
          <button
            onClick={() => setTagsExpanded(!tagsExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium border-none cursor-pointer"
            style={{
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
            }}
          >
            <span>Tags</span>
            <span
              style={{
                transform: tagsExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
                display: "inline-block",
              }}
            >
              ▸
            </span>
          </button>
          {tagsExpanded && (
            <TagsPanel
              onSelectTag={handleSelectTag}
              selectedTag={selectedTag ?? null}
            />
          )}
        </div>
      )}
    </aside>
  );
}
