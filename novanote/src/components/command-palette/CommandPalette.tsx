import { useState, useEffect, useRef, useCallback } from "react";
import { fuzzyMatch } from "../../utils/fuzzyMatch";

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  execute: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export default function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Filter and sort commands by fuzzy match score
  const filtered = query.trim()
    ? commands
        .map((cmd) => {
          const { match, score } = fuzzyMatch(query, cmd.label);
          return { cmd, match, score };
        })
        .filter((r) => r.match)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.cmd)
    : commands;

  // Reset state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Clamp selectedIdx when filtered list changes
  useEffect(() => {
    setSelectedIdx((prev) => Math.min(prev, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIdx]) {
          filtered[selectedIdx].execute();
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIdx, onClose],
  );

  // Click outside to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

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
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Input */}
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
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
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

        {/* Command list */}
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 && (
            <div
              className="px-4 py-3 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              No matching commands.
            </div>
          )}
          {filtered.length > 0 && (
            <ul className="py-1">
              {filtered.map((cmd, idx) => (
                <li key={cmd.id}>
                  <button
                    type="button"
                    onClick={() => {
                      cmd.execute();
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className="w-full text-left px-4 py-2.5 transition-colors flex items-center justify-between"
                    style={{
                      backgroundColor:
                        idx === selectedIdx ? "var(--bg-hover)" : "transparent",
                      color: "var(--text-primary)",
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: "var(--bg-hover)",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        {cmd.category}
                      </span>
                      <span className="text-sm">{cmd.label}</span>
                    </span>
                    {cmd.shortcut && (
                      <kbd
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: "var(--bg-hover)",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
