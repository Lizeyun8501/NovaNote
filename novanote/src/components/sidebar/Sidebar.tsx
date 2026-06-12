import ThemeToggle from "../theme/ThemeToggle";
import { SyncStatus } from "../sync/SyncStatus";
import { useTranslation } from "react-i18next";
import type { FileTreeNode } from "../../types";
import FileTree from "./FileTree";
import TagsPanel from "../tags/TagsPanel";
import { useState, useCallback } from "react";

type PanelTab = "files" | "tags" | null;

interface SidebarProps {
  files: FileTreeNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onOpenVault: () => void;
  onNewNote: () => void;
  onNewCanvas?: () => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  selectedTag?: string | null;
  onSelectTag?: (tag: string) => void;
  onOpenDailyNote?: () => void;
  onSyncClick?: () => void;
  onOpenAI?: () => void;
  onOpenCalendar?: () => void;
  onOpenPlugins?: () => void;
  onOpenSearch?: () => void;
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
  selectedTag,
  onSelectTag,
  onOpenDailyNote,
  onSyncClick,
  onOpenAI,
  onOpenCalendar,
  onOpenPlugins,
  onOpenSearch,
}: SidebarProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PanelTab>("files");

  const toggleTab = useCallback((tab: PanelTab) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  }, []);

  const handleSelectTag = (tag: string) => {
    if (onSelectTag) {
      onSelectTag(selectedTag === tag ? "" : tag);
    }
  };

  return (
    <div className="flex h-screen" style={{ flexShrink: 0 }}>
      {/* ===== Icon Strip (always visible) ===== */}
      <div
        className="flex flex-col items-center py-2 gap-0.5 border-r"
        style={{
          width: "48px",
          backgroundColor: "var(--bg-sidebar)",
          borderColor: "var(--border-color)",
        }}
      >
        {/* Logo */}
        <div
          className="mb-2 flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer"
          style={{ background: "var(--gradient-accent)" }}
          title="NovaNote"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>

        <Divider />

        {/* New note */}
        <IconBarButton
          onClick={onNewNote}
          title={t("actionBar.newNote")}
          accent
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </IconBarButton>

        <Divider />

        {/* Files tab */}
        <IconBarButton
          onClick={() => toggleTab("files")}
          title={t("sidebar.files")}
          active={activeTab === "files"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </IconBarButton>

        {/* Search */}
        <IconBarButton
          onClick={onOpenSearch ?? (() => {})}
          title={t("search.title")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </IconBarButton>

        {/* Tags tab */}
        {onSelectTag && (
          <IconBarButton
            onClick={() => toggleTab("tags")}
            title={t("sidebar.tags")}
            active={activeTab === "tags"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </IconBarButton>
        )}

        {/* Daily note */}
        {onOpenDailyNote && (
          <IconBarButton
            onClick={onOpenDailyNote}
            title={t("actionBar.dailyNote")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </IconBarButton>
        )}

        {/* Canvas */}
        {onNewCanvas && (
          <IconBarButton
            onClick={onNewCanvas}
            title={t("actionBar.newCanvas")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </IconBarButton>
        )}

        <Divider />

        {/* AI */}
        {onOpenAI && (
          <IconBarButton
            onClick={onOpenAI}
            title={t("actionBar.aiAssistant")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </IconBarButton>
        )}

        {/* Calendar */}
        {onOpenCalendar && (
          <IconBarButton
            onClick={onOpenCalendar}
            title={t("actionBar.calendar")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <circle cx="12" cy="16" r="2" />
            </svg>
          </IconBarButton>
        )}

        {/* Plugins */}
        {onOpenPlugins && (
          <IconBarButton
            onClick={onOpenPlugins}
            title={t("actionBar.plugins")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </IconBarButton>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom section */}
        {onSyncClick && (
          <IconBarButton
            onClick={onSyncClick}
            title={t("sidebar.syncSettings")}
          >
            <SyncStatus />
          </IconBarButton>
        )}

        <div className="flex items-center justify-center">
          <ThemeToggle />
        </div>
      </div>

      {/* ===== Content Panel (conditional) ===== */}
      {activeTab && (
        <div
          className="flex flex-col border-r h-screen"
          style={{
            width: "240px",
            backgroundColor: "var(--bg-sidebar)",
            borderColor: "var(--border-color)",
          }}
        >
          {activeTab === "files" && (
            <>
              {/* Files header */}
              <div
                className="flex items-center justify-between px-3 py-2.5 border-b"
                style={{ borderColor: "var(--border-color)" }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("sidebar.files")}
                </span>
                <div className="flex items-center gap-0.5">
                  <PanelHeaderBtn onClick={onNewNote} title={t("actionBar.newNote")}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </PanelHeaderBtn>
                  <PanelHeaderBtn onClick={onOpenVault} title={t("actionBar.openVault")}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </PanelHeaderBtn>
                </div>
              </div>

              {/* File tree */}
              <div className="flex-1 overflow-y-auto px-1 py-1" style={{ scrollbarWidth: "thin" }}>
                {files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-30">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
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
            </>
          )}

          {activeTab === "tags" && (
            <>
              {/* Tags header */}
              <div
                className="flex items-center justify-between px-3 py-2.5 border-b"
                style={{ borderColor: "var(--border-color)" }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("sidebar.tags")}
                </span>
              </div>

              {/* Tags content */}
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                <TagsPanel onSelectTag={handleSelectTag} selectedTag={selectedTag ?? null} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* Divider */
function Divider() {
  return <div className="w-6 h-px my-1" style={{ backgroundColor: "var(--border-color)" }} />;
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

/* Small header button in content panel */
function PanelHeaderBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:opacity-80"
      style={{
        backgroundColor: "transparent",
        color: "var(--text-muted)",
      }}
      title={title}
    >
      {children}
    </button>
  );
}
