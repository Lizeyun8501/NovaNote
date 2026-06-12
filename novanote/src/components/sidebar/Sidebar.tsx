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
      {collapsed ? (
        /* ===== COLLAPSED: Icon Bar ===== */
        <div className="flex flex-col items-center h-full py-2 gap-1">
          {/* Logo */}
          <div className="mb-2 flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: "var(--gradient-accent)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>

          {/* Divider */}
          <div className="w-6 h-px my-1" style={{ backgroundColor: "var(--border-color)" }} />

          {/* Primary actions */}
          <IconBarButton
            onClick={onNewNote}
            title={t("actionBar.newNote")}
            active={false}
            accent={true}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </IconBarButton>

          <IconBarButton
            onClick={toggleCollapsed}
            title={t("search.title")}
            active={false}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </IconBarButton>

          <IconBarButton
            onClick={toggleCollapsed}
            title={t("sidebar.files")}
            active={false}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </IconBarButton>

          {/* Divider */}
          <div className="w-6 h-px my-1" style={{ backgroundColor: "var(--border-color)" }} />

          {/* Secondary actions */}
          {onOpenAI && (
            <IconBarButton
              onClick={onOpenAI}
              title={t("actionBar.aiAssistant")}
              active={false}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a2 2 0 0 1 2 2c0 1.1-.9 2-2 2a2 2 0 0 1-2-2c0-1.1.9-2 2-2z" />
                <path d="M12 12c2.2 0 4-1.8 4-4V6c0-2.2-1.8-4-4-4S8 3.8 8 6v2c0 2.2 1.8 4 4 4z" />
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </IconBarButton>
          )}

          {onOpenCalendar && (
            <IconBarButton
              onClick={onOpenCalendar}
              title={t("actionBar.calendar")}
              active={false}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </IconBarButton>
          )}

          {onOpenPlugins && (
            <IconBarButton
              onClick={onOpenPlugins}
              title={t("actionBar.plugins")}
              active={false}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </IconBarButton>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bottom section */}
          <IconBarButton
            onClick={onSyncClick ?? (() => {})}
            title={t("sidebar.syncSettings")}
            active={false}
          >
            <SyncStatus />
          </IconBarButton>

          <div className="flex items-center justify-center">
            <ThemeToggle />
          </div>

          <IconBarButton
            onClick={toggleCollapsed}
            title={t("sidebar.expandSidebar")}
            active={false}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </IconBarButton>
        </div>
      ) : (
        /* ===== EXPANDED: Full Sidebar ===== */
        <>
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-3 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
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
            <div className="flex items-center gap-1">
              {onSyncClick && (
                <button
                  onClick={onSyncClick}
                  className="border-none bg-transparent cursor-pointer p-0 rounded-md hover:opacity-80 transition-opacity"
                  title={t("sidebar.syncSettings")}
                >
                  <SyncStatus />
                </button>
              )}
              <ThemeToggle />
              <button
                onClick={toggleCollapsed}
                className="px-1.5 py-1.5 rounded-md text-sm transition-colors hover:opacity-80"
                style={{ color: "var(--text-secondary)" }}
                title={t("sidebar.collapseSidebar")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Action Bar */}
          <ActionBar
            onOpenVault={onOpenVault}
            onNewNote={onNewNote}
            onNewCanvas={onNewCanvas}
            onOpenDailyNote={onOpenDailyNote}
            onOpenTemplateSelector={onOpenTemplateSelector}
            onImport={onImport}
            onOpenAI={onOpenAI}
            onOpenCalendar={onOpenCalendar}
            onOpenPlugins={onOpenPlugins}
          />

          {/* File Tree */}
          <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: "thin" }}>
            {files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-40">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
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

          {/* Tags Section */}
          {onSelectTag && (
            <div className="border-t" style={{ borderColor: "var(--border-color)" }}>
              <button
                onClick={() => setTagsExpanded(!tagsExpanded)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium border-none cursor-pointer rounded-lg transition-colors"
                style={{ backgroundColor: "transparent", color: "var(--text-secondary)" }}
              >
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                  {t("sidebar.tags")}
                </span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: tagsExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              {tagsExpanded && (
                <TagsPanel onSelectTag={handleSelectTag} selectedTag={selectedTag ?? null} />
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}

/* Icon bar button with tooltip */
function IconBarButton({
  children,
  onClick,
  title,
  active = false,
  accent = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="relative group flex items-center justify-center">
      <button
        onClick={onClick}
        className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 hover:opacity-90 active:scale-[0.95]"
        style={{
          backgroundColor: active ? "var(--accent)" : "transparent",
          background: accent ? "var(--gradient-accent)" : undefined,
          color: active || accent ? "#fff" : "var(--text-secondary)",
        }}
        title={title}
      >
        {children}
      </button>
      {/* Tooltip */}
      <div
        className="absolute left-full ml-2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-color)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        {title}
      </div>
    </div>
  );
}
