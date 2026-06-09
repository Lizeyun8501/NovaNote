import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Editor } from "./components/editor";
import Sidebar from "./components/sidebar/Sidebar";
import SearchBar from "./components/search/SearchBar";
import BacklinksPanel from "./components/backlinks/BacklinksPanel";
import GraphView from "./components/graph/GraphView";
import ExportMenu from "./components/export/ExportMenu";
import TemplateSelector from "./components/templates/TemplateSelector";
import ImportWizard from "./components/import/ImportWizard";
import CanvasEditor from "./components/canvas/CanvasEditor";
import CommandPalette from "./components/command-palette/CommandPalette";
import { SetupPassword } from "./components/sync/SetupPassword";
import { SyncSettings } from "./components/sync/SyncSettings";
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
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [, setNoteContent] = useState<string>("");
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPathRef = useRef<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [canvasPath, setCanvasPath] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
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
          `Note '${target}' does not exist. Create it?`
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

  // Handle new note creation
  const handleNewNote = useCallback(async () => {
    if (!vaultPath) return;

    const fileName = `Untitled-${Date.now()}.md`;
    const content = `# Untitled\n\nStart writing here.\n`;

    try {
      // Write the file using the vault_write_note command
      await invoke("vault_write_note", {
        relativePath: fileName,
        content,
      });

      // Re-scan to update the list
      await invoke("vault_scan");
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      setNotes(noteList);
      setFileTree(buildFileTree(noteList));

      // Select the new file
      setSelectedPath(fileName);
      currentPathRef.current = fileName;
      setNoteContent(content);
      setHtmlContent(content);
    } catch (err) {
      console.error("Failed to create note:", err);
    }
  }, [vaultPath]);

  // Handle new canvas creation
  const handleNewCanvas = useCallback(async () => {
    if (!vaultPath) return;

    const fileName = `Untitled-canvas-${Date.now()}.canvas`;
    const data = JSON.stringify({ nodes: [], edges: [] });

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
        label: "New Note",
        shortcut: undefined,
        category: "File",
        execute: () => handleNewNote(),
      },
      {
        id: "new-canvas",
        label: "New Canvas",
        shortcut: undefined,
        category: "File",
        execute: () => handleNewCanvas(),
      },
      {
        id: "open-daily-note",
        label: "Open Daily Note",
        shortcut: undefined,
        category: "Navigation",
        execute: () => handleOpenDailyNote(),
      },
      {
        id: "toggle-graph",
        label: "Toggle Graph View",
        shortcut: undefined,
        category: "View",
        execute: () => setShowGraph((prev) => !prev),
      },
      {
        id: "open-template-selector",
        label: "New Note from Template",
        shortcut: undefined,
        category: "File",
        execute: () => setShowTemplateSelector(true),
      },
      {
        id: "import-notes",
        label: "Import Notes",
        shortcut: undefined,
        category: "File",
        execute: () => setShowImportWizard(true),
      },
    ],
    [handleNewNote, handleNewCanvas, handleOpenDailyNote],
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
      onOpenTemplateSelector={() => setShowTemplateSelector(true)}
      onImport={() => setShowImportWizard(true)}
      onSyncClick={() => setShowSyncSettings(true)}
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
                  ? "Select a note from the sidebar"
                  : "Open a vault to get started"}
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
        <div className="flex-1 overflow-hidden p-0">
          {canvasPath ? (
            <CanvasEditor
              key={canvasPath}
              canvasPath={canvasPath}
              onNavigateToNote={handleSelectFile}
            />
          ) : selectedPath ? (
            <div className="h-full overflow-y-auto p-6">
              <Editor
                key={selectedPath}
                content={htmlContent}
                onChange={handleChange}
                placeholder="Start writing your note..."
                onLinkClick={handleLinkClick}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p style={{ color: "var(--text-muted)" }}>
                {vaultPath
                  ? "← Select a note or create a new one"
                  : "← Open a vault folder to begin"}
              </p>
            </div>
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
