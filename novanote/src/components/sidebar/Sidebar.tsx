import { useState, useCallback } from "react";
import type { FileTreeNode, NoteMeta } from "../../types";
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
  vaultPath: string | null;
  onSelectFile: (path: string) => void;
  onSelectView: (view: SidebarView) => void;
  onSelectTag: (tag: string) => void;
  onOpenVault: () => void;
  onCreateNotebook: (name: string) => void;
  onCreateSubdir: (parentDir: string, name: string) => void;
  onNewNote: (parentDir?: string) => void;
  onNewCanvas?: (parentDir?: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  onOpenDailyNote?: () => void;
  onOpenAI?: () => void;
  onOpenCalendar?: () => void;
  onOpenSearch?: () => void;
  onOpenSync?: () => void;
}

export default function Sidebar({
  files,
  selectedPath,
  selectedTag,
  activeView,
  vaultPath,
  onSelectFile,
  onSelectView,
  onSelectTag,
  onOpenVault,
  onCreateNotebook,
  onCreateSubdir,
  onNewNote,
  onNewCanvas,
  onRename,
  onDelete,
  onOpenAI,
  onOpenSearch,
  onOpenSync,
  onOpenCalendar,
  onOpenDailyNote,
  notes,
}: SidebarProps) {
  const [notesFolderOpen] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");

  const handleCreateNotebook = useCallback(() => {
    const name = newNotebookName.trim();
    if (!name) {
      alert("请输入笔记本名称");
      return;
    }
    onCreateNotebook(name);
    setNewNotebookName("");
    setCreatingNotebook(false);
  }, [newNotebookName, onCreateNotebook]);

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
        style={{ borderColor: "var(--border-color)" }}
      >
        <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          我的笔记
        </span>
        <div className="flex items-center gap-1">
          {vaultPath && (
            <IconBtn
              onClick={() => {
                setCreatingNotebook(true);
                setNewNotebookName("");
              }}
              title="新建笔记本"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </IconBtn>
          )}
          <IconBtn onClick={onOpenVault} title="打开知识库">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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

      {/* 新建笔记本输入框 */}
      {creatingNotebook && (
        <div
          className="px-4 py-3 border-b shrink-0 flex items-center gap-2"
          style={{ borderColor: "var(--border-color)" }}
        >
          <input
            type="text"
            value={newNotebookName}
            onChange={(e) => setNewNotebookName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateNotebook();
              if (e.key === "Escape") setCreatingNotebook(false);
            }}
            placeholder="笔记本名称..."
            autoFocus
            className="flex-1 px-3 py-1.5 rounded-md text-sm outline-none"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--accent)",
            }}
          />
          <button
            onClick={handleCreateNotebook}
            className="px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors"
            style={{
              backgroundColor: "var(--accent)",
              color: "#fff",
            }}
          >
            创建
          </button>
          <button
            onClick={() => {
              setCreatingNotebook(false);
              setNewNotebookName("");
            }}
            className="px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors"
            style={{
              color: "var(--text-muted)",
            }}
          >
            取消
          </button>
        </div>
      )}

      {/* 文件树（无限层级） */}
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-40">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
              {vaultPath ? "暂无笔记" : "尚未打开知识库"}
            </p>
            <button
              onClick={onOpenVault}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
              style={{
                background: "var(--gradient-accent)",
                color: "#fff",
              }}
            >
              {vaultPath ? "新建笔记" : "打开知识库"}
            </button>
          </div>
        ) : (
          <div className="py-2">
            <FileTree
              nodes={files}
              selectedPath={selectedPath}
              onSelect={onSelectFile}
              onRename={onRename}
              onDelete={onDelete}
              onNewNote={onNewNote}
              onNewCanvas={onNewCanvas}
              onCreateSubdir={onCreateSubdir}
              depth={0}
              defaultOpen={notesFolderOpen}
            />
          </div>
        )}
      </div>

      {/* 快捷操作分组 */}
      <div className="px-2 py-2 border-t shrink-0" style={{ borderColor: "var(--border-color)" }}>
        <SectionLabel>快捷操作</SectionLabel>
        <NavItem
          onClick={() => {
            onSelectView("all");
            onSelectFile(notes[0]?.relative_path || "");
          }}
          active={activeView === "all"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span>全部笔记</span>
        </NavItem>
        <NavItem
          onClick={() => onOpenDailyNote?.()}
          active={activeView === "calendar"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>每日笔记</span>
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
            <circle cx="12" cy="16" r="2" />
          </svg>
          <span>日历视图</span>
        </NavItem>
        <NavItem
          onClick={() => onOpenAI?.()}
          active={false}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
            <circle cx="9" cy="10" r="1" />
            <circle cx="15" cy="10" r="1" />
            <path d="M9 16c1-1 2.5-1.5 3-1.5s2 .5 3 1.5" />
          </svg>
          <span>AI 助手</span>
        </NavItem>
        {/* 标签视图 */}
        <NavItem
          onClick={() => {
            onSelectView("tags");
            setTagsExpanded(!tagsExpanded);
          }}
          active={activeView === "tags"}
          hasArrow
          arrowOpen={tagsExpanded}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
          <span>全部标签</span>
        </NavItem>
        {tagsExpanded && (
          <div style={{ paddingLeft: "24px", marginTop: "4px" }}>
            <TagsPanel onSelectTag={onSelectTag} selectedTag={selectedTag ?? null} />
          </div>
        )}
      </div>
    </aside>
  );
}

/* ========== 文件树组件：支持无限递归、任意层级创建笔记/子目录 ========== */

function FileTree({
  nodes,
  selectedPath,
  onSelect,
  onRename,
  onDelete,
  onNewNote,
  onNewCanvas,
  onCreateSubdir,
  depth,
  defaultOpen = true,
}: {
  nodes: FileTreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  onNewNote: (parentDir?: string) => void;
  onNewCanvas?: (parentDir?: string) => void;
  onCreateSubdir: (parentDir: string, name: string) => void;
  depth: number;
  defaultOpen?: boolean;
}) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {nodes.map((node) => (
        <FileTreeNodeItem
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          onNewNote={onNewNote}
          onNewCanvas={onNewCanvas}
          onCreateSubdir={onCreateSubdir}
          depth={depth}
          defaultOpen={defaultOpen}
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
  onNewNote,
  onNewCanvas,
  onCreateSubdir,
  depth,
  defaultOpen,
}: {
  node: FileTreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  onNewNote: (parentDir?: string) => void;
  onNewCanvas?: (parentDir?: string) => void;
  onCreateSubdir: (parentDir: string, name: string) => void;
  depth: number;
  defaultOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [creatingSubdir, setCreatingSubdir] = useState(false);
  const [subdirName, setSubdirName] = useState("");

  if (node.is_dir) {
    return (
      <li>
        <div
          className="flex items-center gap-1 w-full text-left px-2 py-1.5 rounded-md text-sm select-none transition-all duration-150 hover:opacity-90 cursor-pointer group"
          style={{
            paddingLeft: `${8 + depth * 16}px`,
            color: "var(--text-secondary)",
          }}
          onClick={() => setExpanded(!expanded)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          {/* 展开/收起箭头 */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
              flexShrink: 0,
              opacity: node.children.length > 0 ? 1 : 0,
            }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {/* 文件夹图标 */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, marginLeft: "2px" }}
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="truncate font-medium flex-1">{node.name}</span>

          {/* 操作按钮 */}
          <div
            className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ flexShrink: 0 }}
          >
            <MiniBtn
              title="新建笔记"
              onClick={(e) => {
                e.stopPropagation();
                onNewNote(node.path);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </MiniBtn>
            <MiniBtn
              title="新建子目录"
              onClick={(e) => {
                e.stopPropagation();
                setCreatingSubdir(true);
                setSubdirName("");
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </MiniBtn>
          </div>
        </div>

        {/* 子目录内联创建 */}
        {creatingSubdir && (
          <div
            className="flex items-center gap-1 py-1"
            style={{ paddingLeft: `${8 + (depth + 1) * 16 + 28}px` }}
          >
            <input
              type="text"
              value={subdirName}
              onChange={(e) => setSubdirName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && subdirName.trim()) {
                  onCreateSubdir(node.path, subdirName);
                  setCreatingSubdir(false);
                  setSubdirName("");
                }
                if (e.key === "Escape") {
                  setCreatingSubdir(false);
                  setSubdirName("");
                }
              }}
              placeholder="目录名称..."
              autoFocus
              className="flex-1 px-2 py-1 rounded-md text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-primary)",
                border: "1px solid var(--accent)",
              }}
            />
            <button
              onClick={() => {
                if (subdirName.trim()) {
                  onCreateSubdir(node.path, subdirName);
                  setCreatingSubdir(false);
                  setSubdirName("");
                }
              }}
              className="px-1.5 py-1 rounded text-xs cursor-pointer"
              style={{
                backgroundColor: "var(--accent)",
                color: "#fff",
              }}
            >
              ✓
            </button>
            <button
              onClick={() => {
                setCreatingSubdir(false);
                setSubdirName("");
              }}
              className="px-1.5 py-1 rounded text-xs cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* 递归渲染子节点 */}
        {expanded && node.children.length > 0 && (
          <FileTree
            nodes={node.children}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
            onNewNote={onNewNote}
            onNewCanvas={onNewCanvas}
            onCreateSubdir={onCreateSubdir}
            depth={depth + 1}
            defaultOpen={defaultOpen}
          />
        )}

        {/* 右键菜单 */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            items={[
              {
                label: "重命名",
                onClick: () => {
                  const newName = prompt("新名称:", node.name);
                  if (newName && newName.trim() && newName !== node.name) {
                    const parentPath = node.path.substring(0, node.path.lastIndexOf("/") + 1);
                    onRename?.(node.path, parentPath + newName.trim());
                  }
                },
              },
              {
                label: "删除",
                onClick: () => {
                  if (confirm(`确定要删除 "${node.name}" 吗?`)) {
                    onDelete?.(node.path);
                  }
                },
              },
            ]}
          />
        )}
      </li>
    );
  }

  // 文件节点
  const isSelected = selectedPath === node.path;

  return (
    <li>
      <button
        onClick={() => onSelect(node.path)}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        className="flex items-center gap-1 w-full text-left px-2 py-1.5 rounded-md text-sm select-none transition-all duration-150 cursor-pointer"
        style={{
          paddingLeft: `${8 + depth * 16 + 28}px`,
          color: isSelected ? "var(--accent)" : "var(--text-secondary)",
          backgroundColor: isSelected ? "var(--toolbar-active)" : "transparent",
          fontWeight: isSelected ? 500 : 400,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
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

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: "重命名",
              onClick: () => {
                const newName = prompt("新名称:", node.name);
                if (newName && newName.trim() && newName !== node.name) {
                  const parentPath = node.path.substring(0, node.path.lastIndexOf("/") + 1);
                  const ext = node.path.includes(".") ? node.path.substring(node.path.lastIndexOf(".")) : "";
                  const newFileName = newName.trim().endsWith(ext)
                    ? newName.trim()
                    : newName.trim() + ext;
                  onRename?.(node.path, parentPath + newFileName);
                }
              },
            },
            {
              label: "删除",
              onClick: () => {
                if (confirm(`确定要删除 "${node.name}" 吗?`)) {
                  onDelete?.(node.path);
                }
              },
            },
          ]}
        />
      )}
    </li>
  );
}

/* ========== 小组件：Section 标签、按钮、右键菜单 ========== */

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

function MiniBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-5 h-5 flex items-center justify-center rounded transition-colors hover:opacity-80 cursor-pointer"
      style={{ color: "var(--text-muted)", backgroundColor: "transparent" }}
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
  hasArrow = false,
  arrowOpen = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  hasArrow?: boolean;
  arrowOpen?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 hover:opacity-90 cursor-pointer"
      style={{
        backgroundColor: active ? "var(--bg-hover)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
      }}
    >
      <span className="flex-shrink-0 flex items-center justify-center">{children instanceof Array ? children[0] : null}</span>
      <span className="flex-1 text-left truncate flex items-center gap-2">
        {children instanceof Array ? children.slice(1) : null}
      </span>
      {hasArrow && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: arrowOpen ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            flexShrink: 0,
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </button>
  );
}

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: { label: string; onClick: () => void }[];
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 py-1 rounded shadow-lg border text-sm"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-color)",
        }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className="block w-full text-left px-4 py-1.5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer whitespace-nowrap"
            style={{ color: "var(--text-primary)" }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
