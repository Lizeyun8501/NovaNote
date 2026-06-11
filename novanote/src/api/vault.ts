import { invoke } from "@tauri-apps/api/core";
import { buildFileTree } from "../utils/buildFileTree";
import type { NoteMeta, FileTreeNode } from "../types";

export interface VaultData {
  notes: NoteMeta[];
  fileTree: FileTreeNode[];
}

/**
 * Re-scan the vault and refresh the notes list + file tree.
 * This is the canonical way to sync the UI with the filesystem state.
 */
export async function refreshVaultData(): Promise<VaultData> {
  await invoke("vault_scan");
  const noteList: NoteMeta[] = await invoke("vault_list_notes");
  return {
    notes: noteList,
    fileTree: buildFileTree(noteList),
  };
}

/**
 * Read a note's content from the vault.
 */
export async function readNoteContent(relativePath: string): Promise<string> {
  return invoke<string>("vault_read_note", { relativePath });
}

/**
 * Write content to a note and re-index it.
 */
export async function writeNoteContent(
  relativePath: string,
  content: string
): Promise<void> {
  await invoke("vault_write_note", { relativePath, content });
}

/**
 * Write a canvas (JSON) file.
 */
export async function writeCanvasFile(
  relativePath: string,
  data: string
): Promise<void> {
  await invoke("vault_write_canvas", { relativePath, data });
}

/**
 * Read a canvas file.
 */
export async function readCanvasFile(relativePath: string): Promise<string> {
  return invoke<string>("vault_read_canvas", { relativePath });
}

/**
 * Rename a note.
 */
export async function renameNote(
  oldRelativePath: string,
  newRelativePath: string
): Promise<void> {
  await invoke("vault_rename_note", { oldRelativePath, newRelativePath });
}

/**
 * Delete a note.
 */
export async function deleteNote(relativePath: string): Promise<void> {
  await invoke("vault_delete_note", { relativePath });
}

/**
 * Get notes filtered by tag.
 */
export async function getNotesByTag(tag: string): Promise<NoteMeta[]> {
  return invoke<NoteMeta[]>("vault_get_notes_by_tag", { tag });
}

/**
 * Save current content as a template.
 */
export async function saveAsTemplate(
  name: string,
  content: string
): Promise<void> {
  await invoke("vault_save_as_template", { name, content });
}

/**
 * Export a note to a specified format.
 */
export async function exportNote(
  relativePath: string,
  outputPath: string,
  format: string
): Promise<void> {
  await invoke("vault_export_note", { relativePath, outputPath, format });
}

/**
 * Import notes from a directory path.
 */
export async function importNotes(
  sourcePath: string,
  format: string
): Promise<NoteMeta[]> {
  return invoke<NoteMeta[]>("vault_import", { sourcePath, format });
}

/**
 * List available templates.
 */
export async function listTemplates(): Promise<string[]> {
  return invoke<string[]>("vault_list_templates");
}

/**
 * Get template content by name.
 */
export async function getTemplateContent(name: string): Promise<string> {
  return invoke<string>("vault_get_template_content", { name });
}

/**
 * Delete a template.
 */
export async function deleteTemplate(name: string): Promise<void> {
  await invoke("vault_delete_template", { name });
}

/**
 * Open a vault at the given path.
 */
export async function openVault(path: string): Promise<void> {
  await invoke("vault_open", { path });
}

/**
 * Start the file watcher for external changes.
 */
export async function startWatcher(): Promise<void> {
  await invoke("vault_start_watcher");
}

/**
 * Stop the file watcher.
 */
export async function stopWatcher(): Promise<void> {
  await invoke("vault_stop_watcher");
}

/**
 * Get file watcher events.
 */
export async function getWatcherEvents(): Promise<
  { type: string; path: string; from?: string; to?: string }[]
> {
  return invoke("vault_get_watcher_events");
}