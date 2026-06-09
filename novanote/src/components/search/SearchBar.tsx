import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteMeta } from "../../types";

export type { NoteMeta };

interface SearchBarProps {
  onSelect: (note: NoteMeta) => void;
}

function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedQuery = escapeRegex(query);
  return escaped.replace(
    new RegExp(`(${escapedQuery})`, "gi"),
    '<mark class="search-highlight">$1</mark>',
  );
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function SearchBar({ onSelect }: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Reset state when opening/closing
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setError(null);
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    invoke<NoteMeta[]>("vault_search", { query: debouncedQuery })
      .then((data) => {
        if (!cancelled) {
          setResults(data);
          setSelectedIdx(0);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(String(err));
          setResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Keyboard navigation within results
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[selectedIdx]) {
          onSelect(results[selectedIdx]);
          setOpen(false);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    },
    [results, selectedIdx, onSelect],
  );

  // Click outside to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        setOpen(false);
      }
    },
    [],
  );

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.4)" }}
    >
      <div
        className="w-full max-w-lg rounded-lg shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-color)",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Search Input */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-color)" }}
        >
          <svg
            className="w-5 h-5 shrink-0"
            style={{ color: "var(--text-muted)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes..."
            className="flex-1 bg-transparent border-none outline-none text-base"
            style={{ color: "var(--text-primary)" }}
          />
          <kbd
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: "var(--bg-hover)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-color)",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {loading && (
            <div
              className="px-4 py-3 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Searching...
            </div>
          )}

          {error && (
            <div
              className="px-4 py-3 text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              {error}
            </div>
          )}

          {!loading && !error && debouncedQuery.trim() && results.length === 0 && (
            <div
              className="px-4 py-3 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              No results found.
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <ul className="py-1">
              {results.map((note, idx) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(note);
                      setOpen(false);
                    }}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{
                      backgroundColor:
                        idx === selectedIdx ? "var(--bg-hover)" : "transparent",
                      color: "var(--text-primary)",
                    }}
                  >
                    <div
                      className="text-sm font-semibold truncate"
                      dangerouslySetInnerHTML={{
                        __html: highlightMatch(note.title, debouncedQuery),
                      }}
                    />
                    <div
                      className="text-xs mt-0.5 truncate"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {note.relative_path}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!loading && !error && !debouncedQuery.trim() && (
            <div
              className="px-4 py-3 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Type to search your notes...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}