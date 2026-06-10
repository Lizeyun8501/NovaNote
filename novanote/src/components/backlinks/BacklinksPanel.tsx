import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteMeta } from "../../types";

interface BacklinkWithBlock {
  note: NoteMeta;
  target_heading: string;
  target_block_id: string;
}

interface BacklinksPanelProps {
  currentPath: string | null;
  onSelectFile: (path: string) => void;
}

export default function BacklinksPanel({
  currentPath,
  onSelectFile,
}: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<BacklinkWithBlock[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (!currentPath) {
      setBacklinks([]);
      return;
    }

    const fetchBacklinks = async () => {
      try {
        const result: Array<[NoteMeta, string, string]> = await invoke("vault_get_backlinks_with_blocks", {
          relativePath: currentPath,
        });
        setBacklinks(result.map(([note, target_heading, target_block_id]) => ({
          note,
          target_heading,
          target_block_id,
        })));
      } catch (err) {
        console.error("Failed to fetch backlinks:", err);
        setBacklinks([]);
      }
    };

    fetchBacklinks();
  }, [currentPath]);

  if (!currentPath) return null;

  return (
    <div
      className="backlinks-panel"
      style={{
        width: isCollapsed ? "40px" : "240px",
        borderLeft: "1px solid var(--border-color, #d1d5db)",
        backgroundColor: "var(--bg-secondary, #f9fafb)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        transition: "width 0.2s ease",
        overflow: "hidden",
      }}
    >
      <div
        className="backlinks-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-color, #d1d5db)",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {!isCollapsed && (
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--text-secondary, #6b7280)",
              whiteSpace: "nowrap",
            }}
          >
            Backlinks ({backlinks.length})
          </span>
        )}
        <span
          style={{
            fontSize: "12px",
            color: "var(--text-muted, #9ca3af)",
          }}
        >
          {isCollapsed ? "◀" : "▶"}
        </span>
      </div>

      {!isCollapsed && (
        <div
          className="backlinks-list"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "4px 0",
          }}
        >
          {backlinks.length === 0 ? (
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted, #9ca3af)",
                padding: "8px 12px",
                margin: 0,
              }}
            >
              No backlinks yet
            </p>
          ) : (
            backlinks.map((bl) => (
              <div
                key={bl.note.id + bl.target_heading + bl.target_block_id}
                className="backlink-item"
                style={{
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontSize: "13px",
                  color: "var(--text-primary, #1f2937)",
                  borderBottom: "1px solid var(--border-color, #e5e7eb)",
                }}
                onClick={() => onSelectFile(bl.note.relative_path)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    "var(--bg-hover, #e5e7eb)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    "transparent";
                }}
              >
                <div style={{ fontWeight: 500 }}>{bl.note.title}</div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted, #9ca3af)",
                    marginTop: "2px",
                  }}
                >
                  {bl.note.relative_path}
                </div>
                {(bl.target_heading || bl.target_block_id) && (
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--accent-color, #3b82f6)",
                      marginTop: "2px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {bl.target_heading && (
                      <span>→ #{bl.target_heading}</span>
                    )}
                    {bl.target_block_id && (
                      <span>→ ^{bl.target_block_id}</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
