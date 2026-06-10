import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Editor } from "./components/editor";
import Sidebar from "./components/sidebar/Sidebar";
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
import { SetupPassword } from "./components/sync/SetupPassword";
import { SyncSettings } from "./components/sync/SyncSettings";
import AIPanel from "./components/ai/AIPanel";
import CalendarView from "./components/calendar/CalendarView";
import PluginMarket from "./components/plugin/PluginMarket";
import SqlQueryPanel from "./components/sql/SqlQueryPanel";
import MindMapView from "./components/mindmap/MindMapView";
import TableView from "./components/tableview/TableView";
import type { Command } from "./components/command-palette/CommandPalette";
import { getDailyNotePath, getDailyNoteTemplate } from "./components/daily-note/dailyNote";
import { buildFileTree } from "./utils/buildFileTree";
import { MobileLayout } from "./components/layout/MobileLayout";
import type { NoteMeta, FileTreeNode } from "./types";
import "./App.css";
import "./styles/responsive.css";

const VAULT_STORAGE_KEY = "novanote-vault";

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
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState<string>("");
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);
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

  // Open vault by path
  const openVault = useCallback(async (path: string) => {
    try {
      await invoke("vault_open", { path });
      setVaultPath(path);

      // Re-scan and list notes
      await invoke("vault_scan");
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      setNotes(noteList);
      setFileTree(buildFileTree(noteList));
    } catch (err) {
      console.error("Failed to open vault:", err);
    }
  }, []);

  // Handle open vault button
  const handleOpenVault = useCallback(async () => {
    const stored = localStorage.getItem(VAULT_STORAGE_KEY);
    if (stored) {
      await openVault(stored);
    }
  }, [openVault]);

  // Auto-open last vault on mount
  useEffect(() => {
    const stored = localStorage.getItem(VAULT_STORAGE_KEY);
    if (stored) {
      openVault(stored);
    }
  }, [openVault]);

  // File watcher: start when vault is opened, poll for external changes
  useEffect(() => {
    if (!vaultPath) return;

    // Start the file watcher
    invoke("vault_start_watcher").catch((err) =>
      console.error("Failed to start file watcher:", err)
    );

    // Poll for file change events every 2 seconds
    const pollInterval = setInterval(async () => {
      try {
        const events = await invoke<
          { type: string; path: string; from?: string; to?: string }[]
        >("vault_get_watcher_events");

        for (const event of events) {
          const relativePath = event.path
            ? event.path.replace(vaultPath + "/", "").replace(vaultPath + "\\", "")
            : null;

          switch (event.type) {
            case "Modified":
              if (relativePath && relativePath === currentPathRef.current) {
                // Currently selected file was modified externally - reload content
                try {
                  const content: string = await invoke("vault_read_note", {
                    relativePath: relativePath,
                  });
                  setNoteContent(content);
                  setHtmlContent(content);
                } catch (readErr) {
                  console.error("Failed to reload modified note:", readErr);
                }
              }
              // Re-index the modified file
              try {
                await invoke("vault_scan");
                const noteList: NoteMeta[] = await invoke("vault_list_notes");
                setNotes(noteList);
                setFileTree(buildFileTree(noteList));
              } catch (scanErr) {
                console.error("Failed to re-scan after modification:", scanErr);
              }
              break;

            case "Created":
              // New file created externally - refresh the file list
              try {
                await invoke("vault_scan");
                const noteList: NoteMeta[] = await invoke("vault_list_notes");
                setNotes(noteList);
                setFileTree(buildFileTree(noteList));
              } catch (scanErr) {
                console.error("Failed to re-scan after creation:", scanErr);
              }
              break;

            case "Deleted":
              // File deleted externally - refresh file list and clear if current
              if (relativePath && relativePath === currentPathRef.current) {
                setSelectedPath(null);
                currentPathRef.current = null;
                setHtmlContent("");
                setNoteContent("");
              }
              try {
                await invoke("vault_scan");
                const noteList: NoteMeta[] = await invoke("vault_list_notes");
                setNotes(noteList);
                setFileTree(buildFileTree(noteList));
              } catch (scanErr) {
                console.error("Failed to re-scan after deletion:", scanErr);
              }
              break;

            case "Renamed":
              // File renamed externally - refresh file list
              if (relativePath && relativePath === currentPathRef.current) {
                // If the current file was renamed, try to follow it
                const newRelativePath = event.to
                  ? event.to.replace(vaultPath + "/", "").replace(vaultPath + "\\", "")
                  : null;
                if (newRelativePath) {
                  setSelectedPath(newRelativePath);
                  currentPathRef.current = newRelativePath;
                } else {
                  setSelectedPath(null);
                  currentPathRef.current = null;
                  setHtmlContent("");
                  setNoteContent("");
                }
              }
              try {
                await invoke("vault_scan");
                const noteList: NoteMeta[] = await invoke("vault_list_notes");
                setNotes(noteList);
                setFileTree(buildFileTree(noteList));
              } catch (scanErr) {
                console.error("Failed to re-scan after rename:", scanErr);
              }
              break;
          }
        }
      } catch (err) {
        // Silently ignore poll errors (vault might be closed)
      }
    }, 2000);

    return () => {
      clearInterval(pollInterval);
      invoke("vault_stop_watcher").catch(() => {});
    };
  }, [vaultPath]);

  // Select a file and load its content
  const handleSelectFile = useCallback(async (path: string) => {
    // Check if it's a canvas file
    if (path.endsWith(".canvas")) {
      setCanvasPath(path);
      setSelectedPath(path);
      currentPathRef.current = path;
      setNoteContent("");
      setHtmlContent("");
      return;
    }

    // Clear canvas state when selecting a regular note
    setCanvasPath(null);

    try {
      const content: string = await invoke("vault_read_note", {
        relativePath: path,
      });
      setSelectedPath(path);
      currentPathRef.current = path;
      setNoteContent(content);
      setHtmlContent(content);
    } catch (err) {
      console.error("Failed to read note:", err);
    }
  }, []);

  // Handle wikilink click - navigate to target note, create if doesn't exist
  const handleLinkClick = useCallback(
    async (target: string) => {
      if (!vaultPath) return;

      // Determine the relative path for the target
      const targetPath = target.endsWith(".md") ? target : `${target}.md`;

      try {
        // Try to read the note first
        await invoke("vault_read_note", { relativePath: targetPath });
        // Note exists, navigate to it
        await handleSelectFile(targetPath);
      } catch {
        // Note doesn't exist, ask user for confirmation before creating
        const confirmed = window.confirm(
          t("app.createLinkedNote", { target })
        );
        if (!confirmed) return;

        try {
          const content = `# ${target}\n\n`;
          await invoke("vault_write_note", {
            relativePath: targetPath,
            content,
          });
          // Re-scan to update the list
          await invoke("vault_scan");
          const noteList: NoteMeta[] = await invoke("vault_list_notes");
          setNotes(noteList);
          setFileTree(buildFileTree(noteList));
          // Navigate to the new note
          await handleSelectFile(targetPath);
        } catch (writeErr) {
          console.error("Failed to create linked note:", writeErr);
        }
      }
    },
    [vaultPath, handleSelectFile],
  );

  // Handle editor content changes (save with debounce)
  const handleChange = useCallback(
    (html: string, markdown: string) => {
      setHtmlContent(html);
      setNoteContent(markdown);

      const path = currentPathRef.current;
      if (!path) return;

      // Debounce save
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(async () => {
        try {
          await invoke("vault_write_note", {
            relativePath: path,
            content: markdown,
          });
        } catch (err) {
          console.error("Failed to save note:", err);
        }
      }, 500);
    },
    [],
  );

  // Handle search result selection
  const handleSearchSelect = useCallback(async (note: NoteMeta) => {
    try {
      const content: string = await invoke("vault_read_note", {
        relativePath: note.relative_path,
      });
      setSelectedPath(note.relative_path);
      currentPathRef.current = note.relative_path;
      setNoteContent(content);
      setHtmlContent(content);
    } catch (err) {
      console.error("Failed to read note from search:", err);
    }
  }, []);

  // Handle file rename
  const handleRename = useCallback(async (oldPath: string, newPath: string) => {
    try {
      await invoke("vault_rename_note", { oldRelativePath: oldPath, newRelativePath: newPath });
      // Refresh tree
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      setNotes(noteList);
      setFileTree(buildFileTree(noteList));
      if (selectedPath === oldPath) {
        setSelectedPath(newPath);
        currentPathRef.current = newPath;
      }
    } catch (err) {
      console.error("Rename failed:", err);
    }
  }, [selectedPath]);

  // Handle file delete
  const handleDelete = useCallback(async (path: string) => {
    try {
      await invoke("vault_delete_note", { relativePath: path });
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      setNotes(noteList);
      setFileTree(buildFileTree(noteList));
      if (selectedPath === path) {
        setSelectedPath(null);
        currentPathRef.current = null;
        setHtmlContent("");
        setNoteContent("");
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }, [selectedPath]);

  // Handle new note creation - show template manager first
  const handleNewNote = useCallback(async () => {
    if (!vaultPath) return;
    setShowTemplateManager(true);
  }, [vaultPath]);

  // Handle heading click from outline panel - scroll editor to heading
  const handleHeadingClick = useCallback((headingId: string) => {
    const editorEl = document.querySelector(".editor-content .ProseMirror");
    if (!editorEl) return;
    const targetEl = editorEl.querySelector(`#${CSS.escape(headingId)}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Handle new canvas creation
  const handleNewCanvas = useCallback(async () => {
    if (!vaultPath) return;

    const fileName = `Untitled-canvas-${Date.now()}.canvas`;
    const data = JSON.stringify({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

    try {
      await invoke("vault_write_canvas", {
        relativePath: fileName,
        data,
      });

      // Re-scan to update the list
      await invoke("vault_scan");
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      setNotes(noteList);
      setFileTree(buildFileTree(noteList));

      // Select the new canvas
      setCanvasPath(fileName);
      setSelectedPath(fileName);
      currentPathRef.current = fileName;
      setNoteContent("");
      setHtmlContent("");
    } catch (err) {
      console.error("Failed to create canvas:", err);
    }
  }, [vaultPath]);

  // Handle tag selection - filter file tree by tag
  const handleSelectTag = useCallback(async (tag: string) => {
    if (!tag) {
      // Clear tag filter
      setSelectedTag(null);
      setFileTree(buildFileTree(notes));
      return;
    }

    setSelectedTag(tag);
    try {
      const filteredNotes: NoteMeta[] = await invoke("vault_get_notes_by_tag", { tag });
      setFileTree(buildFileTree(filteredNotes));
    } catch (err) {
      console.error("Failed to filter notes by tag:", err);
    }
  }, [notes]);

  // Handle opening daily note
  const handleOpenDailyNote = useCallback(async () => {
    if (!vaultPath) return;

    const dailyPath = getDailyNotePath();

    try {
      // Try to read the daily note
      const content: string = await invoke("vault_read_note", { relativePath: dailyPath });
      setSelectedPath(dailyPath);
      currentPathRef.current = dailyPath;
      setNoteContent(content);
      setHtmlContent(content);
    } catch {
      // Daily note doesn't exist, create it with template
      try {
        const content = getDailyNoteTemplate();
        await invoke("vault_write_note", { relativePath: dailyPath, content });
        await invoke("vault_scan");
        const noteList: NoteMeta[] = await invoke("vault_list_notes");
        setNotes(noteList);
        setFileTree(buildFileTree(noteList));
        setSelectedPath(dailyPath);
        currentPathRef.current = dailyPath;
        setNoteContent(content);
        setHtmlContent(content);
      } catch (writeErr) {
        console.error("Failed to create daily note:", writeErr);
      }
    }
  }, [vaultPath]);

  // Handle template selection - create new note with template content
  const handleTemplateSelect = useCallback(async (content: string) => {
    if (!vaultPath) return;

    setShowTemplateSelector(false);

    const fileName = `Untitled-${Date.now()}.md`;

    try {
      await invoke("vault_write_note", { relativePath: fileName, content });
      await invoke("vault_scan");
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      setNotes(noteList);
      setFileTree(buildFileTree(noteList));
      setSelectedPath(fileName);
      currentPathRef.current = fileName;
      setNoteContent(content);
      setHtmlContent(content);
    } catch (err) {
      console.error("Failed to create note from template:", err);
    }
  }, [vaultPath]);

  // Handle saving current note as template
  const handleSaveAsTemplate = useCallback(async () => {
    const path = currentPathRef.current;
    if (!path) return;

    const templateName = path.replace(/\.md$/, "");
    try {
      const content: string = await invoke("vault_read_note", { relativePath: path });
      await invoke("vault_save_as_template", { name: templateName, content });
    } catch (err) {
      console.error("Failed to save as template:", err);
    }
  }, []);

  // Handle template manager selection - create new note with template content
  const handleTemplateManagerSelect = useCallback(async (content: string) => {
    if (!vaultPath) return;

    setShowTemplateManager(false);

    // If content is empty (user clicked "Skip"), create a blank note
    const noteContent = content || `# Untitled\n\nStart writing here.\n`;
    const fileName = `Untitled-${Date.now()}.md`;

    try {
      await invoke("vault_write_note", { relativePath: fileName, content: noteContent });
      await invoke("vault_scan");
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      setNotes(noteList);
      setFileTree(buildFileTree(noteList));
      setSelectedPath(fileName);
      currentPathRef.current = fileName;
      setNoteContent(noteContent);
      setHtmlContent(noteContent);
    } catch (err) {
      console.error("Failed to create note from template:", err);
    }
  }, [vaultPath]);

  // Handle saving template from TemplateManager
  const handleTemplateManagerSave = useCallback(async (name: string, content: string) => {
    const path = currentPathRef.current;
    const templateContent = path
      ? await invoke("vault_read_note", { relativePath: path }).catch(() => content)
      : content;
    try {
      await invoke("vault_save_as_template", { name, content: templateContent });
    } catch (err) {
      console.error("Failed to save template:", err);
    }
  }, []);

  // Handle AI panel - tags generated
  const handleAITagsGenerated = useCallback(async (tags: string[]) => {
    try {
      // Add tags to current note by updating its content with frontmatter tags
      const path = currentPathRef.current;
      if (!path) return;
      const content: string = await invoke("vault_read_note", { relativePath: path });
      // Add or update tags in frontmatter
      let newContent = content;
      const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
      if (frontmatterRegex.test(content)) {
        // Update existing tags
        newContent = content.replace(/^tags:\s*\[.*?\]/m, `tags: [${tags.map((t) => `"${t}"`).join(", ")}]`);
        if (newContent === content) {
          // Add tags line to existing frontmatter
          newContent = content.replace(/(^---\n)/, `$1tags: [${tags.map((t) => `"${t}"`).join(", ")}]\n`);
        }
      } else {
        // Add new frontmatter
        const tagsLine = `---\ntags: [${tags.map((t) => `"${t}"`).join(", ")}]\n---\n\n`;
        newContent = tagsLine + content;
      }
      await invoke("vault_write_note", { relativePath: path, content: newContent });
      // Refresh notes
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      setNotes(noteList);
      setFileTree(buildFileTree(noteList));
    } catch (err) {
      console.error("Failed to apply AI tags:", err);
    }
  }, []);

  // Handle AI panel - summary generated
  const handleAISummaryGenerated = useCallback(async (summary: string) => {
    try {
      const path = currentPathRef.current;
      if (!path) return;
      const content: string = await invoke("vault_read_note", { relativePath: path });
      // Add summary to frontmatter
      let newContent = content;
      const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
      if (frontmatterRegex.test(content)) {
        newContent = content.replace(/^summary:\s*.*\n?/m, "");
        newContent = newContent.replace(/(^---\n)/, `$1summary: "${summary.replace(/"/g, '\\"')}"\n`);
      } else {
        const summaryLine = `---\nsummary: "${summary.replace(/"/g, '\\"')}"\n---\n\n`;
        newContent = summaryLine + content;
      }
      await invoke("vault_write_note", { relativePath: path, content: newContent });
    } catch (err) {
      console.error("Failed to apply AI summary:", err);
    }
  }, []);

  // Handle AI panel - writing result
  const handleAIWritingResult = useCallback((_text: string) => {
    // The result is displayed in the AI panel; user can copy it
  }, []);

  // Handle calendar date selection
  const handleCalendarSelectDate = useCallback(
    async (dateStr: string) => {
      setShowCalendar(false);
      if (!vaultPath) return;

      // Parse YYYY-MM-DD and create a daily note path
      const parts = dateStr.split("-");
      const dailyPath = `daily/${parts[0]}-${parts[1]}-${parts[2]}.md`;

      try {
        const content: string = await invoke("vault_read_note", { relativePath: dailyPath });
        setSelectedPath(dailyPath);
        currentPathRef.current = dailyPath;
        setNoteContent(content);
        setHtmlContent(content);
        setCanvasPath(null);
      } catch {
        // Create the daily note
        try {
          const template = getDailyNoteTemplate();
          await invoke("vault_write_note", { relativePath: dailyPath, content: template });
          await invoke("vault_scan");
          const noteList: NoteMeta[] = await invoke("vault_list_notes");
          setNotes(noteList);
          setFileTree(buildFileTree(noteList));
          setSelectedPath(dailyPath);
          currentPathRef.current = dailyPath;
          setNoteContent(template);
          setHtmlContent(template);
          setCanvasPath(null);
        } catch (writeErr) {
          console.error("Failed to create daily note from calendar:", writeErr);
        }
      }
    },
    [vaultPath],
  );

  // Build set of dates that have notes (for calendar dot indicators)
  const notesWithDates = useMemo(() => {
    const dates = new Set<string>();
    for (const note of notes) {
      // Match daily note pattern: daily/YYYY-MM-DD.md
      const match = note.relative_path.match(/daily\/(\d{4}-\d{2}-\d{2})\.md$/);
      if (match) {
        dates.add(match[1]);
      }
    }
    return dates;
  }, [notes]);

  // Handle import complete - refresh the file tree
  const handleImportComplete = useCallback(async (_importedNotes: NoteMeta[]) => {
    try {
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      setNotes(noteList);
      setFileTree(buildFileTree(noteList));
    } catch (err) {
      console.error("Failed to refresh notes after import:", err);
    }
  }, []);

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
    [handleNewNote, handleNewCanvas, handleOpenDailyNote, t],
  );

  const sidebarNode = (
    <Sidebar
      files={fileTree}
      selectedPath={selectedPath}
      onSelectFile={handleSelectFile}
      onOpenVault={handleOpenVault}
      onNewNote={handleNewNote}
      onNewCanvas={handleNewCanvas}
      onRename={handleRename}
      onDelete={handleDelete}
      selectedTag={selectedTag}
      onSelectTag={handleSelectTag}
      onOpenDailyNote={handleOpenDailyNote}
      onOpenTemplateSelector={() => setShowTemplateManager(true)}
      onImport={() => setShowImportWizard(true)}
      onSyncClick={() => setShowSyncSettings(true)}
      onOpenAI={() => setShowAIPanel(true)}
      onOpenCalendar={() => setShowCalendar(true)}
      onOpenPlugins={() => setShowPluginMarket(true)}
    />
  );

  const contentNode = (
    <>
      <main className="flex-1 flex flex-col min-w-0">
        {/* Editor header */}
        <header
          className="px-6 py-3 border-b shrink-0"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
          }}
        >
          {selectedPath ? (
            <div className="flex items-center justify-between min-w-0">
              <p
                className="text-sm truncate"
                style={{ color: "var(--text-secondary)" }}
              >
                {canvasPath ? "🎨 " : ""}
                {selectedPath}
              </p>
              <div className="flex items-center gap-2">
                {!canvasPath && (
                  <button
                    onClick={() => setShowOutline((prev) => !prev)}
                    className="px-2 py-1 rounded text-sm transition-colors"
                    style={{
                      backgroundColor: showOutline ? "var(--accent-color, #4f46e5)" : "var(--bg-hover)",
                      color: showOutline ? "#fff" : "var(--text-secondary)",
                      border: "1px solid var(--border-color)",
                      cursor: "pointer",
                    }}
                    title={t("outline.title")}
                  >
                    {t("outline.title")}
                  </button>
                )}
                <button
                  onClick={() => setShowGraph(true)}
                  className="px-2 py-1 rounded text-sm transition-colors"
                  style={{
                    backgroundColor: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                    cursor: "pointer",
                  }}
                  title="Knowledge Graph"
                >
                  Graph
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
                {vaultPath
                  ? t("app.selectNote")
                  : t("app.openVaultToStart")}
              </p>
              {vaultPath && (
                <button
                  onClick={() => setShowGraph(true)}
                  className="px-2 py-1 rounded text-sm transition-colors"
                  style={{
                    backgroundColor: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                    cursor: "pointer",
                  }}
                  title="Knowledge Graph"
                >
                  Graph
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
                placeholder="Start writing your note..."
                onLinkClick={handleLinkClick}
                onSelectionChange={setAiSelectedText}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p style={{ color: "var(--text-muted)" }}>
                {vaultPath
                  ? t("app.selectOrCreate")
                  : t("app.openVaultToBegin")}
              </p>
            </div>
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
          onComplete={() => {
            setShowPasswordSetup(false);
          }}
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
      <MobileLayout sidebar={sidebarNode}>
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
