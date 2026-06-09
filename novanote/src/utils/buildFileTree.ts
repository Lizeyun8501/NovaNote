import type { NoteMeta, FileTreeNode } from "../types";

export function buildFileTree(notes: NoteMeta[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const note of notes) {
    const segments = note.relative_path.split("/");
    let currentLevel = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;

      if (isLast) {
        // This is the file itself
        const pathSoFar = segments.join("/");
        currentLevel.push({
          name: segment,
          path: pathSoFar,
          is_dir: false,
          children: [],
          note_meta: note,
        });
      } else {
        // This is a directory
        const pathSoFar = segments.slice(0, i + 1).join("/");
        let dirNode = currentLevel.find(
          (n) => n.is_dir && n.name === segment
        );
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

  // Sort: directories first, then alphabetical
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