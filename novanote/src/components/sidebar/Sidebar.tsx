import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { FileTreeNode, NoteMeta } from "../../types";
import FileTree from "./FileTree";
import TagsPanel from "../tags/TagsPanel";

export type SidebarView =
  | "all"
  | "recent"
  | "favorites"
  | "pinned"
  | "encrypted"
  | "todo"
  | "calendar"
  | "memo"
  | "dynamic"
  | "tags"
  | "images"
  | "attachments"
  | "voice"
  | "folder";

interface SidebarProps {
  files: FileTreeNode[];
  notes: NoteMeta[];
  selectedPath: string | null;
  selectedTag: string | null;
  activeView: SidebarView;
  onSelectFile: (path: string) => void;
  onSelectView: (view: SidebarView) => void;
  onSelectTag: (tag: string) => void;
  onNewNote: () => void;
  onNewCanvas?: () => void;
  onOpenVault: (path?: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  onOpenDailyNote?: () => void;
  onOpenAI?: () => void;
  onOpenCalendar?: () => void;
  onOpenSearch?: () => void;
  onOpenSync?: () => void;
  onOpenPlugins?: () => void;
}

export default function Sidebar({
  files,
  notes,
  selectedPath,
  selectedTag,
  activeView,
  onSelectFile,
  onSelectView,
  onSelectTag,
  onNewNote,
  onOpenVault,
  onRename,
  onDelete,
  onOpenAI,
  onOpenSearch,
  onOpenSync,
  onOpenCalendar,
}: SidebarProps) {
  const [notesFolderOpen, setNotesFolderOpen] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const handleItemClick = useCallback(
    (view: SidebarView) => {
      onSelectView(view);
    },
    [onSelectView],
  );

  const handleOpenLocalVault = useCallback(async () => {
    // 优先使用 Tauri 原生对话框
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择本地仓库文件夹",
      });
      if (selected) {
        const path = typeof selected === "string" ? selected : String(selected);
        onOpenVault(path);
      }
      return;
    } catch {
      // Tauri 不可用，回退到浏览器 API
    }

    // 浏览器回退：使用 File System Access API
    if ("showDirectoryPicker" in window) {
      try {
        const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
        if (dirHandle) {
          // 浏览器环境下用目录名模拟路径
          onOpenVault(dirHandle.name);
        }
      } catch (err) {
        // 用户取消选择
        if ((err as DOMException).name !== "AbortError") {
          console.error("Directory picker failed:", err);
        }
      }
      return;
    }

    // 最终回退：提示用户
    alert("打开本地仓库功能需要在 Tauri 桌面端使用，或使用支持 File System Access API 的浏览器（Chrome/Edge）。");
  }, [onOpenVault]);

  return (
    <aside
      className="flex flex-col border-r h-screen overflow-y-auto"
      style={{
        width: "260px",
        backgroundColor: "var(--bg-sidebar)",
        borderColor: "var(--border-color)",
        scrollbarWidth: "thin",
      }}
    >
      {/* 顶部标题栏 */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{
          borderColor: "var(--border-color)",
        }}
      >
        <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          笔记本目录
        </span>
        <div className="flex items-center gap-1">
          <IconBtn onClick={handleOpenLocalVault} title="打开本地仓库">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </IconBtn>
          <IconBtn onClick={onOpenSearch ?? (() => {})} title="搜索">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </IconBtn>
          <IconBtn onClick={onOpenSync ?? (() => {})} title="同步">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </IconBtn>
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="px-2 py-2 shrink-0">
        <SectionLabel>快捷操作</SectionLabel>
        <NavItem
          onClick={handleOpenLocalVault}
          active={false}
          accent
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          <span>打开本地仓库</span>
        </NavItem>
        <NavItem
          onClick={() => handleItemClick("all")}
          active={activeView === "all"}
          badge={notes.length > 0 ? String(notes.length) : undefined}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span>全部笔记</span>
        </NavItem>
        <NavItem
          onClick={() => handleItemClick("recent")}
          active={activeView === "recent"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
          <span>最近浏览</span>
        </NavItem>
        <NavItem
          onClick={() => handleItemClick("favorites")}
          active={activeView === "favorites"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>我的收藏</span>
        </NavItem>
        <NavItem
          onClick={() => handleItemClick("pinned")}
          active={activeView === "pinned"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="2" x2="12" y2="22" />
            <path d="M5 16l7-6 7 6" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
          <span>置顶笔记</span>
        </NavItem>
        <NavItem
          onClick={() => handleItemClick("encrypted")}
          active={activeView === "encrypted"}
          rightIcon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          }
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>私密加密空间</span>
        </NavItem>
      </div>

      {/* 笔记本目录 */}
      <div className="px-2 py-2 shrink-0">
        <div className="flex items-center justify-between px-2 mb-1">
          <SectionLabel>笔记本目录</SectionLabel>
          <button
            onClick={onNewNote}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
            title="新建笔记本"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {/* 我的笔记 - 可展开文件夹 */}
        <FolderItem
          isOpen={notesFolderOpen}
          isActive={activeView === "folder"}
          onToggle={() => setNotesFolderOpen(!notesFolderOpen)}
          onClick={() => handleItemClick("folder")}
          badge={files.length > 0 ? String(countFiles(files)) : undefined}
        >
          我的笔记
        </FolderItem>
        {notesFolderOpen && files.length > 0 && (
          <div style={{ paddingLeft: "8px" }}>
            <FileTree
              files={files}
              selectedPath={selectedPath}
              onSelect={onSelectFile}
              onRename={onRename}
              onDelete={onDelete}
            />
          </div>
        )}

        {/* 收藏夹 */}
        <NavItem
          onClick={() => handleItemClick("favorites")}
          active={activeView === "favorites"}
          indent={1}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span>收藏夹</span>
        </NavItem>
      </div>

      {/* 事务管理 */}
      <div className="px-2 py-2 shrink-0">
        <SectionLabel>事务管理</SectionLabel>
        <NavItem
          onClick={() => handleItemClick("todo")}
          active={activeView === "todo"}
          badge="1"
          badgeStyle="orange"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span>待办任务中心</span>
        </NavItem>
        <NavItem
          onClick={() => onOpenCalendar?.()}
          active={activeView === "calendar"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>日历日程</span>
        </NavItem>
        <NavItem
          onClick={() => handleItemClick("memo")}
          active={activeView === "memo"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="13" y2="17" />
          </svg>
          <span>快捷备忘录</span>
        </NavItem>
      </div>

      {/* 智能分类 */}
      <div className="px-2 py-2 pb-4">
        <SectionLabel>智能分类</SectionLabel>
        <NavItem
          onClick={() => handleItemClick("dynamic")}
          active={activeView === "dynamic"}
          rightBadge="新"
          rightBadgeStyle="purple"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span>动态视图</span>
        </NavItem>
        <NavItem
          onClick={() => {
            handleItemClick("tags");
            setTagsExpanded(!tagsExpanded);
          }}
          active={activeView === "tags"}
          badge="8"
          hasArrow
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
          <span>全部标签</span>
        </NavItem>
        {tagsExpanded && (
          <div style={{ paddingLeft: "12px", marginTop: "4px" }}>
            <TagsPanel onSelectTag={onSelectTag} selectedTag={selectedTag ?? null} />
          </div>
        )}
        <NavItem
          onClick={() => handleItemClick("images")}
          active={activeView === "images"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>图片笔记</span>
        </NavItem>
        <NavItem
          onClick={() => handleItemClick("attachments")}
          active={activeView === "attachments"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <span>附件文件笔记</span>
        </NavItem>
        <NavItem
          onClick={() => handleItemClick("voice")}
          active={activeView === "voice"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <span>语音速记笔记</span>
        </NavItem>
      </div>

      {/* 更多功能入口 */}
      {onOpenAI && (
        <div className="px-2 py-2 border-t shrink-0" style={{ borderColor: "var(--border-color)" }}>
          <NavItem onClick={onOpenAI} active={false}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
            <span>AI 助手</span>
          </NavItem>
        </div>
      )}
    </aside>
  );
}

function countFiles(nodes: FileTreeNode[]): number {
  let n = 0;
  for (const node of nodes) {
    if (node.is_dir) {
      n += countFiles(node.children);
    } else {
      n++;
    }
  }
  return n;
}

/* ---------- 小组件 ---------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-2 py-1.5 text-xs font-semibold tracking-wider uppercase select-none"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </div>
  );
}

function IconBtn({
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
      className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:opacity-80 cursor-pointer"
      style={{ color: "var(--text-secondary)", backgroundColor: "transparent" }}
      title={title}
    >
      {children}
    </button>
  );
}

function NavItem({
  children,
  onClick,
  active = false,
  accent = false,
  badge,
  badgeStyle = "muted",
  rightIcon,
  rightBadge,
  rightBadgeStyle = "muted",
  indent = 0,
  hasArrow = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
  badge?: string;
  badgeStyle?: "muted" | "orange" | "accent";
  rightIcon?: React.ReactNode;
  rightBadge?: string;
  rightBadgeStyle?: "muted" | "purple";
  indent?: number;
  hasArrow?: boolean;
}) {
  const bgColor = accent ? "var(--accent)" : active ? "var(--bg-hover)" : "transparent";
  const textColor = accent ? "#fff" : active ? "var(--accent)" : "var(--text-secondary)";

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 hover:opacity-90 cursor-pointer"
      style={{
        backgroundColor: bgColor,
        color: textColor,
        paddingLeft: `${12 + indent * 16}px`,
      }}
    >
      <span className="flex-shrink-0 flex items-center justify-center">{children instanceof Array ? children[0] : children}</span>
      <span className="flex-1 text-left truncate flex items-center gap-2">
        {children instanceof Array ? children.slice(1) : null}
      </span>
      {rightBadge && (
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: rightBadgeStyle === "purple" ? "rgba(139, 92, 246, 0.15)" : "var(--bg-secondary)",
            color: rightBadgeStyle === "purple" ? "#8b5cf6" : "var(--text-muted)",
          }}
        >
          {rightBadge}
        </span>
      )}
      {badge && (
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor:
              badgeStyle === "orange" ? "rgba(251, 146, 60, 0.15)" :
              badgeStyle === "accent" ? "rgba(99, 102, 241, 0.15)" :
              "var(--bg-secondary)",
            color:
              badgeStyle === "orange" ? "#fb923c" :
              badgeStyle === "accent" ? "var(--accent)" :
              "var(--text-muted)",
          }}
        >
          {badge}
        </span>
      )}
      {rightIcon && (
        <span className="flex-shrink-0" style={{ color: "var(--text-muted)" }}>
          {rightIcon}
        </span>
      )}
      {hasArrow && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: "var(--text-muted)" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </button>
  );
}

function FolderItem({
  children,
  onClick,
  onToggle,
  isOpen,
  isActive,
  badge,
}: {
  children: React.ReactNode;
  onClick: () => void;
  onToggle: () => void;
  isOpen: boolean;
  isActive: boolean;
  badge?: string;
}) {
  const bgColor = isActive ? "var(--bg-hover)" : "transparent";
  const textColor = isActive ? "var(--accent)" : "var(--text-secondary)";

  return (
    <div
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 hover:opacity-90 cursor-pointer"
      style={{
        backgroundColor: bgColor,
        color: textColor,
      }}
      onClick={onClick}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded"
        style={{ color: "var(--text-muted)" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      <span className="flex-1 text-left truncate">{children}</span>
      {badge && (
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: "var(--bg-secondary)",
            color: "var(--text-muted)",
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}
