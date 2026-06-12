import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import type { NoteMeta } from "../../types";

export type { NoteMeta };

interface SemanticResult {
  relative_path: string;
  title: string;
  similarity: number;
}

interface SearchBarProps {
  onSelect: (note: NoteMeta) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type SearchMode = "fts" | "regex" | "semantic";

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

export default function SearchBar({ onSelect, open: openProp, onOpenChange }: SearchBarProps) {
  const { t } = useTranslation();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      if (onOpenChange) {
        const resolved = typeof value === "function" ? value(open) : value;
        onOpenChange(resolved);
      } else {
        setOpenInternal(value);
      }
    },
    [onOpenChange, open],
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [searchMode, setSearchMode] = useState<SearchMode>("fts");
  const [regexError, setRegexError] = useState<string | null>(null);
  const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([]);
  const [semanticBaseUrl, setSemanticBaseUrl] = useState("http://localhost:11434");
  const [semanticModel, setSemanticModel] = useState("nomic-embed-text");
  const [semanticSearching, setSemanticSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const semanticSearchCounter = useRef(0);

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
      setSemanticResults([]);
      setError(null);
      setRegexError(null);
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Search when debounced query changes (FTS and regex)
  useEffect(() => {
    if (searchMode === "semantic") return; // semantic is manual trigger
    if (!debouncedQuery.trim()) {
      setResults([]);
      setError(null);
      setRegexError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRegexError(null);

    const invokeSearch = searchMode === "regex"
      ? invoke<NoteMeta[]>("vault_search_regex", { pattern: debouncedQuery })
      : invoke<NoteMeta[]>("vault_search", { query: debouncedQuery });

    invokeSearch
      .then((data) => {
        if (!cancelled) {
          setResults(data);
          setSelectedIdx(0);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const errMsg = String(err);
          if (searchMode === "regex" && errMsg.includes("Invalid regex")) {
            setRegexError(errMsg);
          } else {
            setError(errMsg);
          }
          setResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, searchMode]);

  // Semantic search handler (manual trigger with Enter)
  const handleSemanticSearch = useCallback(async () => {
    if (!query.trim()) return;
    const requestId = ++semanticSearchCounter.current;
    setSemanticSearching(true);
    setError(null);
    setSemanticResults([]);
    try {
      const data: SemanticResult[] = await invoke("ai_semantic_search", {
        query: query.trim(),
        baseUrl: semanticBaseUrl,
        model: semanticModel,
      });
      if (requestId === semanticSearchCounter.current) {
        setSemanticResults(data);
      }
    } catch (err: unknown) {
      if (requestId === semanticSearchCounter.current) {
        setError(String(err));
      }
    } finally {
      if (requestId === semanticSearchCounter.current) {
        setSemanticSearching(false);
      }
    }
  }, [query, semanticBaseUrl, semanticModel]);

  // Keyboard navigation within results
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const max = searchMode === "semantic" ? semanticResults.length - 1 : results.length - 1;
        setSelectedIdx((prev) => Math.min(prev + 1, max));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (searchMode === "semantic") {
          // Trigger semantic search on Enter
          handleSemanticSearch();
        } else if (results[selectedIdx]) {
          onSelect(results[selectedIdx]);
          setOpen(false);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    },
    [results, semanticResults, selectedIdx, onSelect, searchMode, handleSemanticSearch],
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
            placeholder={
              searchMode === "regex" ? t("search.regexPlaceholder") :
              searchMode === "semantic" ? t("search.semanticPlaceholder") :
              t("search.placeholder")
            }
            className="flex-1 bg-transparent border-none outline-none text-base"
            style={{ color: "var(--text-primary)" }}
          />
          <div className="flex gap-1 items-center">
            {(["fts", "regex", "semantic"] as SearchMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setSearchMode(mode);
                  setResults([]);
                  setSemanticResults([]);
                  setError(null);
                  setRegexError(null);
                }}
                className="text-xs px-1.5 py-0.5 rounded font-mono font-bold cursor-pointer transition-colors"
                style={{
                  backgroundColor: searchMode === mode ? "var(--accent-color, #6366f1)" : "var(--bg-hover)",
                  color: searchMode === mode ? "#fff" : "var(--text-muted)",
                  border: "1px solid " + (searchMode === mode ? "var(--accent-color, #6366f1)" : "var(--border-color)"),
                }}
                title={mode === "fts" ? t("search.fullTextSearch") : mode === "regex" ? t("search.regexSearch") : t("search.semanticSearch")}
              >
                {mode === "fts" ? "FTS" : mode === "regex" ? ".*" : "AI"}
              </button>
            ))}
          </div>
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

        {/* Semantic config when in semantic mode */}
          {searchMode === "semantic" && (
            <div
              className="flex items-center gap-2 px-4 py-2 border-b text-xs"
              style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-secondary)" }}
            >
              <input
                type="text"
                value={semanticBaseUrl}
                onChange={(e) => setSemanticBaseUrl(e.target.value)}
                placeholder={t("ai.ollamaUrl")}
                className="w-40 px-1.5 py-1 rounded border"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />
              <input
                type="text"
                value={semanticModel}
                onChange={(e) => setSemanticModel(e.target.value)}
                placeholder={t("ai.semanticModel")}
                className="w-36 px-1.5 py-1 rounded border"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />
              <span style={{ color: "var(--text-muted)" }}>{t("search.pressEnterToSearch")}</span>
            </div>
          )}

          {/* Results */}
          <div className="max-h-72 overflow-y-auto">
            {searchMode !== "semantic" && loading && (
              <div
                className="px-4 py-3 text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {t("search.searching")}
              </div>
            )}

            {searchMode === "semantic" && semanticSearching && (
              <div
                className="px-4 py-3 text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {t("search.searchingSemantically")}
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

            {regexError && (
              <div
                className="px-4 py-2 text-xs"
                style={{ color: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.08)" }}
              >
                {regexError}
              </div>
            )}

            {/* Semantic results */}
            {searchMode === "semantic" && !semanticSearching && !error && semanticResults.length > 0 && (
              <ul className="py-1">
                {semanticResults.map((item, idx) => (
                  <li key={item.relative_path}>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await invoke("vault_read_note", {
                            relativePath: item.relative_path,
                          });
                          onSelect({
                            id: item.relative_path,
                            title: item.title,
                            relative_path: item.relative_path,
                            tags: [],
                            created_at: "",
                            updated_at: "",
                          });
                        } catch {
                          // ignore
                        }
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
                      <div className="flex items-center justify-between">
                        <div
                          className="text-sm font-semibold truncate flex-1"
                          dangerouslySetInnerHTML={{
                            __html: highlightMatch(item.title || item.relative_path, query),
                          }}
                        />
                        <span
                          className="text-xs ml-2 font-mono shrink-0 px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--bg-hover)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {(item.similarity * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div
                        className="text-xs mt-0.5 truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {item.relative_path}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* FTS/Regex results */}
            {searchMode !== "semantic" && !loading && !error && !regexError && debouncedQuery.trim() && results.length === 0 && (
              <div
                className="px-4 py-3 text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {t("search.noResults")}
              </div>
            )}

            {searchMode !== "semantic" && !loading && !error && !regexError && results.length > 0 && (
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

            {!loading && !semanticSearching && !error && (
              searchMode === "semantic"
                ? semanticResults.length === 0
                : !debouncedQuery.trim()
            ) && (
              <div
                className="px-4 py-3 text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {searchMode === "semantic"
                  ? t("search.semanticHint")
                  : t("search.typeToSearch")}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}