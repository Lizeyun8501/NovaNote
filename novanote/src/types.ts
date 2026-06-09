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
  note_meta?: NoteMeta;
}