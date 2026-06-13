import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Editor } from "./components/editor";
import Sidebar, { type SidebarView } from "./components/sidebar/Sidebar";
import SearchBar from "./components/search/SearchBar";
import BacklinksPanel from "./components/backlinks/BacklinksPanel";
import GraphView from "./components/graph/GraphView";
import ExportMenu from "./components/export/ExportMenu";
import TemplateSelector from "./components/templates/TemplateSelector";
import TemplateManager from "./components/template/TemplateManager";
import OutlinePanel from "./components/outline/OutlinePanel";
import ImportWizard from "./components/import/ImportWizard";
import CanvasEditor from "./components/canvas/CanvasEditor";
import CommandPalette from "./components/command-palette/CommandPalette";
import type { Command } from "./components/command-palette/CommandPalette";
import { SetupPassword } from "./components/sync/SetupPassword";
import { SyncSettings } from "./components/sync/SyncSettings";
import AIPanel from "./components/ai/AIPanel";
import CalendarView from "./components/calendar/CalendarView";
import PluginMarket from "./components/plugin/PluginMarket";
import SqlQueryPanel from "./components/sql/SqlQueryPanel";
import MindMapView from "./components/mindmap/MindMapView";
import TableView from "./components/tableview/TableView";
import { getDailyNotePath, getDailyNoteTemplate } from "./components/daily-note/dailyNote";
import { MobileLayout } from "./components/layout/MobileLayout";
import WelcomeScreen from "./components/welcome/WelcomeScreen";
import type { NoteMeta, FileTreeNode } from "./types";
import * as NoteStorage from "./storage/notes";
import "./App.css";
import "./styles/responsive.css";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

function App() {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState<string>("");
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const [activeView, setActiveView] = useState<SidebarView>("all");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPathRef = useRef<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [canvasPath, setCanvasPath] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showPluginMarket, setShowPluginMarket] = useState(false);
  const [showSqlQuery, setShowSqlQuery] = useState(false);
  const [showMindMap, setShowMindMap] = useState(false);
  const [showTableView, setShowTableView] = useState(false);
  const [aiSelectedText, setAiSelectedText] = useState<string>("");
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Cmd/Ctrl+P keyboard shortcut to open command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Load notes from storage on mount
  useEffect(() => {
    const all = NoteStorage.getAllNotes();
    if (all.length === 0) {
      // First visit: create a sample welcome notebook
      NoteStorage.createNotebook("我的笔记本");
      const fresh = NoteStorage.getAllNotes();
      setNotes(fresh);
      setFileTree(NoteStorage.buildTree(fresh));
    } else {
      setNotes(all);
      setFileTree(NoteStorage.buildTree(all));
    }
  }, []);

  // Refresh helpers
  const refresh = useCallback(() => {
    const all = NoteStorage.getAllNotes();
    setNotes(all);
    if (activeView === "tags" && selectedTag) {
      setFileTree(NoteStorage.buildTree(NoteStorage.getNotesByTag(selectedTag)));
    } else {
      setFileTree(NoteStorage.buildTree(all));
    }
  }, [activeView, selectedTag]);

  // Select a file and load its content
  const handleSelectFile = useCallback((path: string) => {
    if (path.endsWith(".canvas")) {
      setCanvasPath(path);
      setSelectedPath(path);
      currentPathRef.current = path;
      setNoteContent("");
      setHtmlContent("");
      return;
    }
    setCanvasPath(null);
    const content = NoteStorage.getNoteContent(path);
    setSelectedPath(path);
    currentPathRef.current = path;
    setNoteContent(content);
    setHtmlContent(content);
  }, []);

  // Handle wikilink click - navigate to target note, create if doesn't exist
  const handleLinkClick = useCallback(async (target: string) => {
    const targetPath = target.endsWith(".md") ? target : `${target}.md`;
    const existing = NoteStorage.getNoteContent(targetPath);
    if (existing) {
      await handleSelectFile(targetPath);
      return;
    }
    const confirmed = window.confirm(t("app.createLinkedNote", { target }));
    if (!confirmed) return;
    const content = `# ${target}\n\n`;
    NoteStorage.writeNote(targetPath, content);
    refresh();
    await handleSelectFile(targetPath);
  }, [handleSelectFile, refresh, t]);

  // Handle editor content changes (save with debounce)
  const handleChange = useCallback(
    (html: string, markdown: string) => {
      setHtmlContent(html);
      setNoteContent(markdown);

      const path = currentPathRef.current;
      if (!path) return;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        NoteStorage.writeNote(path, markdown);
      }, 500);
    },
    []
  );

  // Handle search result selection
  const handleSearchSelect = useCallback((note: NoteMeta) => {
    const content = NoteStorage.getNoteContent(note.relative_path);
    setSelectedPath(note.relative_path);
    currentPathRef.current = note.relative_path;
    setNoteContent(content);
    setHtmlContent(content);
  }, []);

  // Handle file rename
  const handleRename = useCallback((oldPath: string, newPath: string) => {
    NoteStorage.renameNote(oldPath, newPath);
    refresh();
    if (selectedPath === oldPath) {
      setSelectedPath(newPath);
      currentPathRef.current = newPath;
    }
  }, [selectedPath, refresh]);

  // Handle file delete
  const handleDelete = useCallback((path: string) => {
    NoteStorage.deleteNote(path);
    refresh();
    if (selectedPath === path) {
      setSelectedPath(null);
      currentPathRef.current = null;
      setHtmlContent("");
      setNoteContent("");
    }
  }, [selectedPath, refresh]);

  // Handle new note creation (opens template manager)
  const handleNewNote = useCallback((parentDir?: string) => {
    setShowTemplateManager(true);
    setSelectedPath(null);
    currentPathRef.current = null;
    // save parent dir for new note
    (window as unknown as { _novanoteNewParent?: string })._novanoteNewParent = parentDir;
  }, []);

  // Handle new canvas creation
  const handleNewCanvas = useCallback((parentDir?: string) => {
    const fileName = NoteStorage.generateNotePath(parentDir, "未命名画布").replace(/\.md$/, ".canvas");
    const data = JSON.stringify({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    NoteStorage.writeNote(fileName, data);
    refresh();
    setCanvasPath(fileName);
    setSelectedPath(fileName);
    currentPathRef.current = fileName;
    setNoteContent("");
    setHtmlContent("");
  }, [refresh]);

  // Handle tag selection - filter file tree
  const handleSelectTag = useCallback((tag: string) => {
    if (!tag) {
      setSelectedTag(null);
      const all = NoteStorage.getAllNotes();
      setFileTree(NoteStorage.buildTree(all));
      return;
    }
    setSelectedTag(tag);
    const filtered = NoteStorage.getNotesByTag(tag);
    setFileTree(NoteStorage.buildTree(filtered));
  }, []);

  // Handle opening daily note
  const handleOpenDailyNote = useCallback(() => {
    const dailyPath = getDailyNotePath();
    const content = NoteStorage.getNoteContent(dailyPath);
    if (content) {
      setSelectedPath(dailyPath);
      currentPathRef.current = dailyPath;
      setNoteContent(content);
      setHtmlContent(content);
    } else {
      const template = getDailyNoteTemplate();
      NoteStorage.writeNote(dailyPath, template);
      refresh();
      setSelectedPath(dailyPath);
      currentPathRef.current = dailyPath;
      setNoteContent(template);
      setHtmlContent(template);
    }
    setCanvasPath(null);
  }, [refresh]);

  // Handle heading click from outline panel
  const handleHeadingClick = useCallback((headingId: string) => {
    const editorEl = document.querySelector(".editor-content .ProseMirror");
    if (!editorEl) return;
    const targetEl = editorEl.querySelector(`#${CSS.escape(headingId)}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Handle template selection - create new note with template content
  const handleTemplateSelect = useCallback((content: string) => {
    setShowTemplateSelector(false);
    const parentDir = (window as unknown as { _novanoteNewParent?: string })._novanoteNewParent;
    const fileName = NoteStorage.generateNotePath(parentDir || undefined, "未命名");
    NoteStorage.writeNote(fileName, content);
    refresh();
    setSelectedPath(fileName);
    currentPathRef.current = fileName;
    setNoteContent(content);
    setHtmlContent(content);
  }, [refresh]);

  // Handle saving current note as template
  const handleSaveAsTemplate = useCallback(() => {
    const path = currentPathRef.current;
    if (!path) return;
    const content = NoteStorage.getNoteContent(path);
    const templateName = path.replace(/\.md$/, "");
    try {
      const templates = JSON.parse(localStorage.getItem("novanote-templates") || "[]");
      templates.push({ name: templateName, content });
      localStorage.setItem("novanote-templates", JSON.stringify(templates));
    } catch (err) {
      console.error("Failed to save as template:", err);
    }
  }, []);

  // Handle template manager selection - create new note with template content
  const handleTemplateManagerSelect = useCallback((content: string) => {
    setShowTemplateManager(false);
    const parentDir = (window as unknown as { _novanoteNewParent?: string })._novanoteNewParent;
    const noteContent = content || `# 未命名\n\n在这里开始书写。\n`;
    const fileName = NoteStorage.generateNotePath(parentDir || undefined, "未命名");
    NoteStorage.writeNote(fileName, noteContent);
    refresh();
    setSelectedPath(fileName);
    currentPathRef.current = fileName;
    setNoteContent(noteContent);
    setHtmlContent(noteContent);
  }, [refresh]);

  // Handle saving template from TemplateManager
  const handleTemplateManagerSave = useCallback((name: string, content: string) => {
    try {
      const templates = JSON.parse(localStorage.getItem("novanote-templates") || "[]");
      templates.push({ name, content });
      localStorage.setItem("novanote-templates", JSON.stringify(templates));
    } catch (err) {
      console.error("Failed to save template:", err);
    }
  }, []);

  // Create notebook (new top-level directory)
  const handleCreateNotebook = useCallback((name: string) => {
    NoteStorage.createNotebook(name);
    refresh();
  }, [refresh]);

  // Create subdirectory (by creating a note inside it)
  const handleCreateSubdir = useCallback((parentDir: string, dirName: string) => {
    const cleanName = dirName.trim();
    if (!cleanName) return;
    const prefix = parentDir ? parentDir + "/" : "";
    const notePath = prefix + cleanName + "/欢迎.md";
    NoteStorage.writeNote(notePath, `# ${cleanName}\n\n新子目录的欢迎页面。\n`);
    refresh();
  }, [refresh]);

  // Handle AI panel - tags generated
  const handleAITagsGenerated = useCallback((tags: string[]) => {
    const path = currentPathRef.current;
    if (!path) return;
    const content = NoteStorage.getNoteContent(path);
    let newContent = content;
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    if (frontmatterRegex.test(content)) {
      newContent = content.replace(/^tags:\s*\[.*?\]/m, `tags: [${tags.map((tg) => `"${tg}"`).join(", ")}]`);
      if (newContent === content) {
        newContent = content.replace(/(^---\n)/, `$1tags: [${tags.map((tg) => `"${tg}"`).join(", ")}]\n`);
      }
    } else {
      const tagsLine = `---\ntags: [${tags.map((tg) => `"${tg}"`).join(", ")}]\n---\n\n`;
      newContent = tagsLine + content;
    }
    NoteStorage.writeNote(path, newContent);
    refresh();
  }, [refresh]);

  // Handle AI panel - summary generated
  const handleAISummaryGenerated = useCallback((summary: string) => {
    const path = currentPathRef.current;
    if (!path) return;
    const content = NoteStorage.getNoteContent(path);
    let newContent = content;
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    if (frontmatterRegex.test(content)) {
      newContent = content.replace(/^summary:\s*.*\n?/m, "");
      newContent = newContent.replace(/(^---\n)/, `$1summary: "${summary.replace(/"/g, '\\"')}"\n`);
    } else {
      const summaryLine = `---\nsummary: "${summary.replace(/"/g, '\\"')}"\n---\n\n`;
      newContent = summaryLine + content;
    }
    NoteStorage.writeNote(path, newContent);
  }, []);

  // Handle AI panel - writing result
  const handleAIWritingResult = useCallback((_text: string) => {
    // The result is displayed in the AI panel; user can copy it
  }, []);

  // Handle calendar date selection
  const handleCalendarSelectDate = useCallback((dateStr: string) => {
    setShowCalendar(false);
    const parts = dateStr.split("-");
    const dailyPath = `daily/${parts[0]}-${parts[1]}-${parts[2]}.md`;
    const content = NoteStorage.getNoteContent(dailyPath);
    if (content) {
      setSelectedPath(dailyPath);
      currentPathRef.current = dailyPath;
      setNoteContent(content);
      setHtmlContent(content);
      setCanvasPath(null);
    } else {
      const template = getDailyNoteTemplate();
      NoteStorage.writeNote(dailyPath, template);
      refresh();
      setSelectedPath(dailyPath);
      currentPathRef.current = dailyPath;
      setNoteContent(template);
      setHtmlContent(template);
      setCanvasPath(null);
    }
  }, [refresh]);

  // Build set of dates that have notes (for calendar dot indicators)
  const notesWithDates = useMemo(() => {
    const dates = new Set<string>();
    for (const note of notes) {
      const match = note.relative_path.match(/daily\/(\d{4}-\d{2}-\d{2})\.md$/);
      if (match) {
        dates.add(match[1]);
      }
    }
    return dates;
  }, [notes]);

  // Handle import complete
  const handleImportComplete = useCallback(() => {
    refresh();
  }, [refresh]);

  // Built-in commands for the Command Palette
  const commands: Command[] = useMemo(
    () => [
      {
        id: "new-note",
        label: t("commandPalette.commands.newNote"),
        shortcut: undefined,
        category: t("commandPalette.categories.file"),
        execute: () => handleNewNote(),
      },
      {
        id: "new-canvas",
        label: t("commandPalette.commands.newCanvas"),
        shortcut: undefined,
        category: t("commandPalette.categories.file"),
        execute: () => handleNewCanvas(),
      },
      {
        id: "open-daily-note",
        label: t("commandPalette.commands.openDailyNote"),
        shortcut: undefined,
        category: t("commandPalette.categories.navigation"),
        execute: () => handleOpenDailyNote(),
      },
      {
        id: "toggle-graph",
        label: t("commandPalette.commands.toggleGraph"),
        shortcut: undefined,
        category: t("commandPalette.categories.view"),
        execute: () => setShowGraph((prev) => !prev),
      },
      {
        id: "toggle-outline",
        label: t("commandPalette.commands.toggleOutline"),
        shortcut: undefined,
        category: t("commandPalette.categories.view"),
        execute: () => setShowOutline((prev) => !prev),
      },
      {
        id: "open-template-selector",
        label: t("commandPalette.commands.newFromTemplate"),
        shortcut: undefined,
        category: t("commandPalette.categories.file"),
        execute: () => setShowTemplateManager(true),
      },
      {
        id: "import-notes",
        label: t("commandPalette.commands.importNotes"),
        shortcut: undefined,
        category: t("commandPalette.categories.file"),
        execute: () => setShowImportWizard(true),
      },
      {
        id: "ai-assistant",
        label: t("commandPalette.commands.aiAssistant"),
        shortcut: undefined,
        category: t("commandPalette.categories.ai"),
        execute: () => setShowAIPanel(true),
      },
      {
        id: "calendar-view",
        label: t("commandPalette.commands.openCalendar"),
        shortcut: undefined,
        category: t("commandPalette.categories.view"),
        execute: () => setShowCalendar(true),
      },
      {
        id: "plugin-market",
        label: t("commandPalette.commands.pluginMarketplace"),
        shortcut: undefined,
        category: t("commandPalette.categories.plugins"),
        execute: () => setShowPluginMarket(true),
      },
      {
        id: "sql-query",
        label: t("commandPalette.commands.sqlQuery"),
        shortcut: undefined,
        category: t("commandPalette.categories.developer"),
        execute: () => setShowSqlQuery(true),
      },
      {
        id: "mind-map",
        label: t("commandPalette.commands.mindMapView"),
        shortcut: undefined,
        category: t("commandPalette.categories.view"),
        execute: () => setShowMindMap(true),
      },
      {
        id: "table-view",
        label: t("commandPalette.commands.databaseView"),
        shortcut: undefined,
        category: t("commandPalette.categories.view"),
        execute: () => setShowTableView(true),
      },
    ],
    [handleNewNote, handleNewCanvas, handleOpenDailyNote, t]
  );

  const sidebarNode = (
    <Sidebar
      files={fileTree}
      notes={notes}
      selectedPath={selectedPath}
      selectedTag={selectedTag}
      activeView={activeView}
      onSelectFile={handleSelectFile}
      onSelectView={(view) => setActiveView(view)}
      onSelectTag={handleSelectTag}
      onCreateNotebook={handleCreateNotebook}
      onCreateSubdir={handleCreateSubdir}
      onNewNote={handleNewNote}
      onNewCanvas={handleNewCanvas}
      onRename={handleRename}
      onDelete={handleDelete}
      onOpenDailyNote={handleOpenDailyNote}
      onOpenSync={() => setShowSyncSettings(true)}
      onOpenAI={() => setShowAIPanel(true)}
      onOpenCalendar={() => setShowCalendar(true)}
      onOpenSearch={() => setCommandPaletteOpen(true)}
    />
  );

  const contentNode = (
    <>
      <main className="flex-1 flex flex-col min-w-0">
        {/* Editor header */}
        <header
          className="px-4 py-2 border-b shrink-0"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
          }}
        >
          {selectedPath ? (
            <div className="flex items-center justify-between min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                {canvasPath && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                )}
                <p
                  className="text-sm truncate font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {selectedPath}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!canvasPath && (
                  <button
                    onClick={() => setShowOutline((prev) => !prev)}
                    className="px-2.5 py-1.5 rounded-md text-sm transition-all flex items-center gap-1.5"
                    style={{
                      backgroundColor: showOutline ? "var(--accent)" : "transparent",
                      color: showOutline ? "#fff" : "var(--text-secondary)",
                      border: `1px solid ${showOutline ? "var(--accent)" : "var(--border-color)"}`,
                      cursor: "pointer",
                    }}
                    title={t("outline.title")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                    {t("outline.title")}
                  </button>
                )}
                <button
                  onClick={() => setShowGraph(true)}
                  className="px-2.5 py-1.5 rounded-md text-sm transition-all flex items-center gap-1.5"
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                    cursor: "pointer",
                  }}
                  title={t("graph.title")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  {t("graph.open")}
                </button>
                <ExportMenu currentNotePath={selectedPath} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p
                className="text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {notes.length > 0 ? t("app.selectNote") : t("app.openVaultToStart")}
              </p>
              {notes.length > 0 && (
                <button
                  onClick={() => setShowGraph(true)}
                  className="px-2.5 py-1.5 rounded-md text-sm transition-all flex items-center gap-1.5"
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                    cursor: "pointer",
                  }}
                  title={t("graph.title")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  {t("graph.open")}
                </button>
              )}
            </div>
          )}
        </header>

        {/* Editor area */}
        <div className="flex-1 overflow-hidden flex">
          {canvasPath ? (
            <CanvasEditor
              key={canvasPath}
              canvasPath={canvasPath}
              onNavigateToNote={handleSelectFile}
            />
          ) : selectedPath ? (
            <div className="flex-1 overflow-y-auto p-6">
              <Editor
                key={selectedPath}
                content={htmlContent}
                onChange={handleChange}
                placeholder={t("editor.placeholder")}
                onLinkClick={handleLinkClick}
                onSelectionChange={setAiSelectedText}
              />
            </div>
          ) : (
            <WelcomeScreen
              onNewNote={handleNewNote}
              onOpenDailyNote={handleOpenDailyNote}
              onOpenGraph={() => setShowGraph(true)}
              hasVault={notes.length > 0}
            />
          )}
          {showOutline && !canvasPath && selectedPath && (
            <OutlinePanel
              content={noteContent}
              onHeadingClick={handleHeadingClick}
            />
          )}
        </div>
      </main>

      <BacklinksPanel
        currentPath={selectedPath}
        onSelectFile={handleSelectFile}
      />

      <SearchBar onSelect={handleSearchSelect} />

      {showTemplateSelector && (
        <TemplateSelector
          onSelect={handleTemplateSelect}
          onSaveAsTemplate={handleSaveAsTemplate}
          onClose={() => setShowTemplateSelector(false)}
        />
      )}

      {showTemplateManager && (
        <TemplateManager
          onSelectTemplate={handleTemplateManagerSelect}
          onSaveTemplate={handleTemplateManagerSave}
        />
      )}

      <ImportWizard
        isOpen={showImportWizard}
        onClose={() => setShowImportWizard(false)}
        onImportComplete={handleImportComplete}
      />

      {showGraph && (
        <GraphView
          onClose={() => setShowGraph(false)}
          onSelectNote={handleSelectFile}
        />
      )}

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />

      <SyncSettings
        isOpen={showSyncSettings}
        onClose={() => setShowSyncSettings(false)}
        onPasswordSetup={() => {
          setShowSyncSettings(false);
          setShowPasswordSetup(true);
        }}
      />

      {showPasswordSetup && (
        <SetupPassword
          onComplete={() => setShowPasswordSetup(false)}
          onCancel={() => setShowPasswordSetup(false)}
        />
      )}

      {showAIPanel && (
        <AIPanel
          currentNotePath={selectedPath}
          selectedText={aiSelectedText}
          onTagsGenerated={handleAITagsGenerated}
          onSummaryGenerated={handleAISummaryGenerated}
          onWritingResult={handleAIWritingResult}
          onNavigateToNote={(path) => setSelectedPath(path)}
          onClose={() => setShowAIPanel(false)}
        />
      )}

      {showCalendar && (
        <CalendarView
          onSelectDate={handleCalendarSelectDate}
          onClose={() => setShowCalendar(false)}
          notesWithDates={notesWithDates}
        />
      )}

      {showPluginMarket && (
        <PluginMarket
          isOpen={showPluginMarket}
          onClose={() => setShowPluginMarket(false)}
        />
      )}

      {showSqlQuery && (
        <SqlQueryPanel
          onClose={() => setShowSqlQuery(false)}
        />
      )}

      {showMindMap && (
        <MindMapView
          content={noteContent}
          onClose={() => setShowMindMap(false)}
        />
      )}

      {showTableView && (
        <TableView
          notes={notes}
          onSelectNote={(note) => {
            handleSelectFile(note.relative_path);
            setShowTableView(false);
          }}
          onClose={() => setShowTableView(false)}
        />
      )}
    </>
  );

  if (isMobile) {
    return (
      <MobileLayout
        sidebar={sidebarNode}
        onOpenSearch={() => setCommandPaletteOpen(true)}
        onOpenAI={() => setShowAIPanel(true)}
        onOpenCalendar={() => setShowCalendar(true)}
        onOpenMore={() => setCommandPaletteOpen(true)}
      >
        {contentNode}
      </MobileLayout>
    );
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      {sidebarNode}
      {contentNode}
    </div>
  );
}

export default App;
