import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { NoteMeta } from "../../types";

type ImportSource = "obsidian" | "notion" | "joplin";

interface ImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (notes: NoteMeta[]) => void;
}

const SOURCE_INFO: Record<ImportSource, { label: string; description: string; icon: string; selectLabel: string; isDirectory: boolean; filter?: { name: string; extensions: string[] } }> = {
  obsidian: {
    label: "Obsidian",
    description: "Import from an Obsidian vault directory (.md files with frontmatter)",
    icon: "🔮",
    selectLabel: "Select Obsidian Vault Directory",
    isDirectory: true,
  },
  notion: {
    label: "Notion",
    description: "Import from a Notion export directory (Markdown files)",
    icon: "📝",
    selectLabel: "Select Notion Export Directory",
    isDirectory: true,
  },
  joplin: {
    label: "Joplin",
    description: "Import from a Joplin JEX export file",
    icon: "📋",
    selectLabel: "Select JEX File",
    isDirectory: false,
    filter: { name: "Joplin Export", extensions: ["jex"] },
  },
};

export default function ImportWizard({ isOpen, onClose, onImportComplete }: ImportWizardProps) {
  const [selectedSource, setSelectedSource] = useState<ImportSource | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number } | null>(null);

  if (!isOpen) return null;

  const handleSelectSource = async () => {
    if (!selectedSource) return;

    const info = SOURCE_INFO[selectedSource];
    setError(null);
    setResult(null);

    try {
      const selected = await open({
        directory: info.isDirectory,
        multiple: false,
        title: info.selectLabel,
        filters: info.filter ? [info.filter] : undefined,
      });

      if (!selected) return;

      const sourcePath = typeof selected === "string" ? selected : selected;

      setImporting(true);

      const commandMap: Record<ImportSource, string> = {
        obsidian: "vault_import_obsidian",
        notion: "vault_import_notion",
        joplin: "vault_import_joplin",
      };

      const importedNotes: NoteMeta[] = await invoke(commandMap[selectedSource], {
        sourcePath,
      });

      setResult({ count: importedNotes.length });
      onImportComplete(importedNotes);
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (importing) return;
    setSelectedSource(null);
    setError(null);
    setResult(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={handleClose}
    >
      <div
        className="rounded-lg shadow-xl w-full max-w-md mx-4"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Import Notes
          </h2>
          <button
            onClick={handleClose}
            className="text-lg px-2 py-1 rounded hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
            disabled={importing}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Source Selection */}
          {(Object.keys(SOURCE_INFO) as ImportSource[]).map((source) => {
            const info = SOURCE_INFO[source];
            const isSelected = selectedSource === source;
            return (
              <button
                key={source}
                onClick={() => {
                  setSelectedSource(source);
                  setError(null);
                  setResult(null);
                }}
                className="w-full text-left px-4 py-3 rounded-lg border transition-colors"
                style={{
                  backgroundColor: isSelected ? "var(--bg-hover)" : "transparent",
                  borderColor: isSelected ? "var(--accent)" : "var(--border-color)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
                disabled={importing}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{info.icon}</span>
                  <div>
                    <div className="font-medium text-sm">{info.label}</div>
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {info.description}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {/* Importing progress */}
          {importing && selectedSource && (
            <div className="space-y-2">
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Importing from {SOURCE_INFO[selectedSource].label}...
              </p>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--bg-hover)" }}
              >
                <div
                  className="h-full rounded-full import-progress-bar"
                  style={{
                    backgroundColor: "var(--accent)",
                    width: "100%",
                  }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="text-sm px-3 py-2 rounded"
              style={{
                backgroundColor: "rgba(220, 38, 38, 0.1)",
                color: "#dc2626",
              }}
            >
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className="text-sm px-3 py-2 rounded"
              style={{
                backgroundColor: "rgba(22, 163, 74, 0.1)",
                color: "#16a34a",
              }}
            >
              Successfully imported {result.count} note{result.count !== 1 ? "s" : ""}.
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4 border-t"
          style={{ borderColor: "var(--border-color)" }}
        >
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded text-sm"
            style={{
              backgroundColor: "var(--bg-hover)",
              color: "var(--text-secondary)",
            }}
            disabled={importing}
          >
            {result ? "Close" : "Cancel"}
          </button>
          <button
            onClick={handleSelectSource}
            className="px-4 py-2 rounded text-sm font-medium"
            style={{
              backgroundColor: "var(--accent)",
              color: "#ffffff",
              opacity: !selectedSource || importing ? 0.5 : 1,
              cursor: !selectedSource || importing ? "not-allowed" : "pointer",
            }}
            disabled={!selectedSource || importing}
          >
            {importing ? (
              <span className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full border-2 border-t-transparent"
                  style={{
                    borderColor: "#ffffff",
                    borderTopColor: "transparent",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                Importing from {selectedSource ? SOURCE_INFO[selectedSource].label : ""}...
              </span>
            ) : (
              "Import"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
