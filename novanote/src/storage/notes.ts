import type { NoteMeta, FileTreeNode } from "../types";

const CONTENT_KEY = "novanote-contents";

interface StoredNote {
  path: string;
  content: string;
  tags: string[];
  created_at: number;
  updated_at: number;
}

/** Generate a unique note id */
function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Normalize path - strip leading slashes */
function normalizePath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+/g, "/");
}

/** Get all notes from storage */
function loadNotes(): Record<string, StoredNote> {
  try {
    const raw = localStorage.getItem(CONTENT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, StoredNote>;
  } catch {
    return {};
  }
}

/** Save all notes to storage */
function saveNotes(data: Record<string, StoredNote>): void {
  try {
    localStorage.setItem(CONTENT_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to save notes:", err);
  }
}

/** Convert internal storage format to NoteMeta list */
function toNoteMetaList(notes: Record<string, StoredNote>): NoteMeta[] {
  return Object.entries(notes).map(([path, n]) => {
    const segments = path.split("/");
    const filename = segments[segments.length - 1];
    const title = filename.replace(/\.(md|canvas)$/, "");
    return {
      id: genId(),
      title,
      relative_path: path,
      tags: n.tags || [],
      created_at: new Date(n.created_at).toISOString(),
      updated_at: new Date(n.updated_at).toISOString(),
    };
  });
}

/** Get all notes as NoteMeta[] */
export function getAllNotes(): NoteMeta[] {
  const notes = loadNotes();
  return toNoteMetaList(notes);
}

/** Get note content by path */
export function getNoteContent(path: string): string {
  const p = normalizePath(path);
  const notes = loadNotes();
  return notes[p]?.content || "";
}

/** Create or update a note */
export function writeNote(path: string, content: string, tags?: string[]): NoteMeta {
  const p = normalizePath(path);
  const notes = loadNotes();
  const now = Date.now();
  const existing = notes[p];

  notes[p] = {
    path: p,
    content,
    tags: tags ?? existing?.tags ?? extractTags(content),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  saveNotes(notes);
  return toNoteMetaList({ [p]: notes[p] })[0];
}

/** Extract #tags from note content */
function extractTags(content: string): string[] {
  const matches = content.match(/(^|\s)#(\w+)/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.trim().replace(/^#/, ""))));
}

/** Delete a note */
export function deleteNote(path: string): void {
  const p = normalizePath(path);
  const notes = loadNotes();
  if (notes[p]) {
    delete notes[p];
    saveNotes(notes);
  }
}

/** Rename/move a note */
export function renameNote(oldPath: string, newPath: string): NoteMeta | null {
  const oldP = normalizePath(oldPath);
  const newP = normalizePath(newPath);
  if (oldP === newP) return null;

  const notes = loadNotes();
  if (!notes[oldP]) return null;

  const note = notes[oldP];
  delete notes[oldP];
  notes[newP] = {
    ...note,
    path: newP,
    updated_at: Date.now(),
  };
  saveNotes(notes);
  return toNoteMetaList({ [newP]: notes[newP] })[0];
}

/** Get notes filtered by tag */
export function getNotesByTag(tag: string): NoteMeta[] {
  const notes = loadNotes();
  const filtered: Record<string, StoredNote> = {};
  for (const [path, note] of Object.entries(notes)) {
    if ((note.tags || []).includes(tag)) {
      filtered[path] = note;
    }
  }
  return toNoteMetaList(filtered);
}

/** Build a file tree from notes, creating empty directory nodes from paths */
export function buildTree(notes: NoteMeta[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const note of notes) {
    const segments = note.relative_path.split("/");
    let currentLevel = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;

      if (isLast) {
        const pathSoFar = segments.join("/");
        currentLevel.push({
          name: segment,
          path: pathSoFar,
          is_dir: false,
          children: [],
          note_meta: note,
        });
      } else {
        const pathSoFar = segments.slice(0, i + 1).join("/");
        let dirNode = currentLevel.find((n) => n.is_dir && n.name === segment);
        if (!dirNode) {
          dirNode = {
            name: segment,
            path: pathSoFar,
            is_dir: true,
            children: [],
          };
          currentLevel.push(dirNode);
        }
        currentLevel = dirNode.children;
      }
    }
  }

  sortTree(root);
  return root;
}

function sortTree(nodes: FileTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.is_dir !== b.is_dir) {
      return a.is_dir ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.children.length > 0) {
      sortTree(node.children);
    }
  }
}

/** Create a new notebook (just a top-level directory conceptually) - just creates a welcome note */
export function createNotebook(name: string, parentDir?: string): string {
  const cleanName = name.trim();
  if (!cleanName) return "";
  const prefix = parentDir ? normalizePath(parentDir) + "/" : "";
  const path = prefix + cleanName;

  // Create a welcome note to ensure the notebook exists in tree
  const welcomePath = path + "/欢迎.md";
  writeNote(
    welcomePath,
    `# ${cleanName}\n\n这是一个新的笔记本。你可以在这里开始记录你的想法。\n\n- 使用 Markdown 语法\n- 支持无限层级的子目录\n- 支持图片附件链接\n`
  );
  return path;
}

/** Generate a unique path for a new note under a given directory */
export function generateNotePath(parentDir?: string, name?: string): string {
  const prefix = parentDir ? normalizePath(parentDir) + "/" : "";
  const base = name?.trim() || "未命名笔记";
  let candidate = `${prefix}${base}.md`;
  const notes = loadNotes();
  let i = 1;
  while (notes[candidate]) {
    candidate = `${prefix}${base} ${i}.md`;
    i++;
  }
  return candidate;
}

/** Check if a directory exists (has notes under it) */
export function directoryExists(dirPath: string): boolean {
  const p = normalizePath(dirPath);
  const notes = loadNotes();
  return Object.keys(notes).some((key) => key.startsWith(p + "/"));
}
