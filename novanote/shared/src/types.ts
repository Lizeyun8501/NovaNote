// Shared type definitions aligned with the Rust backend (novanote-core/src/lib.rs).
// Uses snake_case to match the Rust Serde serialization for Tauri invoke commands.

export interface NoteMeta {
  id: string;
  title: string;
  relative_path: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// Legacy Note interface — deprecated in favor of NoteMeta which matches backend exactly.
// @deprecated Use NoteMeta from this module or from src/types.ts.
export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  children?: FileTreeNode[];
  isDirectory: boolean;
}

export interface SearchHit {
  relative_path: string;
  title: string;
  snippet: string;
  score: number;
}

export interface GraphNode {
  id: string;
  label: string;
  group: string;
  weight: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}