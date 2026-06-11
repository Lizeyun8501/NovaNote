/** Shared types between frontend and backend. */

export interface NoteMeta {
  id: string;
  title: string;
  relative_path: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileTreeNode[];
}

export interface SyncStatusResponse {
  enabled: boolean;
  server_url: string;
  vault_id: string;
  connected: boolean;
}

export interface VaultConfig {
  id: string;
  name: string;
  created_at: string;
  encryption_key_encrypted?: string;
  sync_salt?: string;
  settings: Record<string, unknown>;
}