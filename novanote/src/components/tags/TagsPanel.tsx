import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TagsPanelProps {
  onSelectTag: (tag: string) => void;
  selectedTag: string | null;
}

export default function TagsPanel({ onSelectTag, selectedTag }: TagsPanelProps) {
  const [tags, setTags] = useState<[string, number][]>([]);

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      const result: [string, number][] = await invoke("vault_list_tags");
      setTags(result);
    } catch (err) {
      console.error("Failed to load tags:", err);
    }
  };

  if (tags.length === 0) {
    return (
      <p
        className="text-xs px-3 py-2"
        style={{ color: "var(--text-muted)" }}
      >
        No tags found.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1 px-3 py-2">
      {tags.map(([name, count]) => (
        <button
          key={name}
          onClick={() => onSelectTag(name)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border-none cursor-pointer"
          style={{
            backgroundColor:
              selectedTag === name
                ? "var(--accent-color, #3b82f6)"
                : "var(--bg-secondary)",
            color:
              selectedTag === name
                ? "#ffffff"
                : "var(--text-secondary)",
            transition: "background-color 0.15s, color 0.15s",
          }}
          title={`${name} (${count} note${count !== 1 ? "s" : ""})`}
        >
          <span>#</span>
          <span>{name}</span>
          <span
            className="rounded-full px-1 text-[10px] leading-none"
            style={{
              backgroundColor:
                selectedTag === name
                  ? "rgba(255,255,255,0.2)"
                  : "var(--border-color)",
              color:
                selectedTag === name
                  ? "#ffffff"
                  : "var(--text-muted)",
            }}
          >
            {count}
          </span>
        </button>
      ))}
    </div>
  );
}
