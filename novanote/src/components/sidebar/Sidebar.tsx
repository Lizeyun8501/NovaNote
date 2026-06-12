import ThemeToggle from "../theme/ThemeToggle";
import { SyncStatus } from "../sync/SyncStatus";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
            className="text-base font-bold select-none tracking-tight"
            style={{
              background: "var(--gradient-accent)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            NovaNote
          </h1>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && onSyncClick && (
            <button
              onClick={onSyncClick}
              className="border-none bg-transparent cursor-pointer p-0 rounded-md hover:opacity-80 transition-opacity"
              title={t("sidebar.syncSettings")}
            >
              <SyncStatus />
            </button>
          )}
          {!collapsed && <ThemeToggle />}
          <button
            onClick={toggleCollapsed}
            className="px-1.5 py-1.5 rounded-md text-sm transition-colors hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
            title={collapsed ? t("sidebar.expandSidebar") : t("sidebar.collapseSidebar")}
          >
            {collapsed ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Action Bar */}
      {!collapsed && (
        <ActionBar onOpenVault={onOpenVault} onNewNote={onNewNote} onNewCanvas={onNewCanvas} onOpenDailyNote={onOpenDailyNote} onOpenTemplateSelector={onOpenTemplateSelector} onImport={onImport} onOpenAI={onOpenAI} onOpenCalendar={onOpenCalendar} onOpenPlugins={onOpenPlugins} />
      )}

      {/* File Tree */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: "thin" }}>
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-40">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <p
                className="text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {t("sidebar.noVault")}
              </p>
            </div>
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
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium border-none cursor-pointer rounded-lg transition-colors"
            style={{
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
            }}
          >
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              {t("sidebar.tags")}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: tagsExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
              }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
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
