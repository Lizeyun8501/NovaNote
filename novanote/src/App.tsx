import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Editor } from "./components/editor";
import Sidebar from "./components/sidebar/Sidebar";
import SearchBar from "./components/search/SearchBar";
import { buildFileTree } from "./utils/buildFileTree";
import type { NoteMeta, FileTreeNode } from "./types";
import "./App.css";

const VAULT_STORAGE_KEY = "novanote-vault";

function App() {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [, setNotes] = useState<NoteMeta[]>([]);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [, setNoteContent] = useState<string>("");
  const [htmlContent, setHtmlContent] = useState<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPathRef = useRef<string | null>(null);

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

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <Sidebar
        files={fileTree}
        selectedPath={selectedPath}
        onSelectFile={handleSelectFile}
        onOpenVault={handleOpenVault}
        onNewNote={handleNewNote}
        onRename={handleRename}
        onDelete={handleDelete}
      />

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
            <p
              className="text-sm truncate"
              style={{ color: "var(--text-secondary)" }}
            >
              {selectedPath}
            </p>
          ) : (
            <p
              className="text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              {vaultPath
                ? "Select a note from the sidebar"
                : "Open a vault to get started"}
            </p>
          )}
        </header>

        {/* Editor area */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedPath ? (
            <Editor
              key={selectedPath}
              content={htmlContent}
              onChange={handleChange}
              placeholder="Start writing your note..."
            />
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

      <SearchBar onSelect={handleSearchSelect} />
    </div>
  );
}

export default App;