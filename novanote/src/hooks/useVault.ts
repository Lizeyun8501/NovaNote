import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { buildFileTree } from "../utils/buildFileTree";
import type { NoteMeta, FileTreeNode } from "../types";

const VAULT_STORAGE_KEY = "novanote-vault";

export function useVault() {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState<string>("");
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const currentPathRef = useRef<string | null>(null);

  /** Refresh the note list and file tree after external changes */
  const refreshNotes = useCallback(async () => {
    try {
      await invoke("vault_scan");
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      setNotes(noteList);
      setFileTree(buildFileTree(noteList));
    } catch (err) {
      console.error("Failed to refresh notes:", err);
    }
  }, []);

  /** Open a vault by path */
  const openVault = useCallback(async (path: string) => {
    try {
      await invoke("vault_open", { path });
      setVaultPath(path);
      await invoke("vault_scan");
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      setNotes(noteList);
      setFileTree(buildFileTree(noteList));
    } catch (err) {
      console.error("Failed to open vault:", err);
    }
  }, []);

  /** Open the last-used vault from localStorage */
  const handleOpenVault = useCallback(async () => {
    const stored = localStorage.getItem(VAULT_STORAGE_KEY);
    if (stored) {
      await openVault(stored);
    }
  }, [openVault]);

  /** Auto-open last vault on mount */
  useEffect(() => {
    const stored = localStorage.getItem(VAULT_STORAGE_KEY);
    if (stored) {
      openVault(stored);
    }
  }, [openVault]);

  /** Persist vault path to localStorage */
  useEffect(() => {
    if (vaultPath) {
      localStorage.setItem(VAULT_STORAGE_KEY, vaultPath);
    }
  }, [vaultPath]);

  return {
    // state
    vaultPath,
    notes,
    fileTree,
    selectedPath,
    noteContent,
    htmlContent,
    selectedTag,
    // setters
    setVaultPath,
    setNotes,
    setFileTree,
    setSelectedPath,
    setNoteContent,
    setHtmlContent,
    setSelectedTag,
    // refs
    currentPathRef,
    // actions
    refreshNotes,
    openVault,
    handleOpenVault,
  };
}