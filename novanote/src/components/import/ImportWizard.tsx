import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { NoteMeta } from "../../types";

type ImportSource = "obsidian" | "notion" | "notion_api" | "joplin" | "email" | "siyuan";

interface NotionPage {
  id: string;
  title: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  parent_type: string;
}

interface ImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (notes: NoteMeta[]) => void;
}

type NotionApiStep = "api_key" | "pages" | "importing";

const SOURCE_INFO: Record<ImportSource, { label: string; description: string; icon: string; selectLabel: string; isDirectory: boolean; filter?: { name: string; extensions: string[] } }> = {
  obsidian: {
    label: "Obsidian",
    description: "Import from an Obsidian vault directory (.md files with frontmatter)",
    icon: "🔮",
    selectLabel: "Select Obsidian Vault Directory",
    isDirectory: true,
  },
  notion: {
    label: "Notion (Export)",
    description: "Import from a Notion export directory (Markdown files)",
    icon: "📝",
    selectLabel: "Select Notion Export Directory",
    isDirectory: true,
  },
  notion_api: {
    label: "Notion (API)",
    description: "Connect to Notion via API and import pages directly",
    icon: "🔌",
    selectLabel: "",
    isDirectory: false,
  },
  joplin: {
    label: "Joplin",
    description: "Import from a Joplin JEX export file",
    icon: "📋",
    selectLabel: "Select JEX File",
    isDirectory: false,
    filter: { name: "Joplin Export", extensions: ["jex"] },
  },
  email: {
    label: "Email (.eml)",
    description: "Import an email file (.eml) and convert it to a Markdown note",
    icon: "✉️",
    selectLabel: "Select .eml Email File",
    isDirectory: false,
    filter: { name: "Email File", extensions: ["eml"] },
  },
  siyuan: {
    label: "SiYuan (思源笔记)",
    description: "Import from a SiYuan Notes export directory (.sy files)",
    icon: "📝",
    selectLabel: "Select SiYuan Export Directory",
    isDirectory: true,
  },
};

export default function ImportWizard({ isOpen, onClose, onImportComplete }: ImportWizardProps) {
  const [selectedSource, setSelectedSource] = useState<ImportSource | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number } | null>(null);

  // Notion API state
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionApiStep, setNotionApiStep] = useState<NotionApiStep>("api_key");
  const [notionPages, setNotionPages] = useState<NotionPage[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const resetNotionApiState = () => {
    setNotionApiKey("");
    setNotionApiStep("api_key");
    setNotionPages([]);
    setSelectedPageIds(new Set());
  };

  const handleSelectSource = async () => {
    if (!selectedSource) return;

    // Notion API uses a different flow
    if (selectedSource === "notion_api") {
      if (notionApiStep === "api_key") {
        await handleNotionApiConnect();
      } else if (notionApiStep === "pages") {
        await handleNotionApiImport();
      }
      return;
    }

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

      if (selectedSource === "email") {
        // Email import uses a different command
        const filename: string = await invoke("import_email_file", {
          emlPath: sourcePath,
        });
        setResult({ count: 1 });
        onImportComplete([{
          id: filename,
          title: filename.replace(/\.md$/, ""),
          relative_path: filename,
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }]);
      } else {
        const commandMap: Record<string, string> = {
          obsidian: "vault_import_obsidian",
          notion: "vault_import_notion",
          joplin: "vault_import_joplin",
          siyuan: "vault_import_obsidian",  // SiYuan exports as .md files, same as Obsidian import
        };

        const importedNotes: NoteMeta[] = await invoke(commandMap[selectedSource], {
          sourcePath,
        });

        setResult({ count: importedNotes.length });
        onImportComplete(importedNotes);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleNotionApiConnect = async () => {
    if (!notionApiKey.trim()) {
      setError("Please enter your Notion API key");
      return;
    }
    setError(null);
    setImporting(true);
    try {
      const pages: NotionPage[] = await invoke("integration_notion_pages", {
        apiKey: notionApiKey.trim(),
        databaseId: null,
      });
      setNotionPages(pages);
      setNotionApiStep("pages");
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleNotionApiImport = async () => {
    if (selectedPageIds.size === 0) {
      setError("Please select at least one page to import");
      return;
    }
    setError(null);
    setNotionApiStep("importing");
    setImporting(true);

    let importedCount = 0;
    const importedNotes: NoteMeta[] = [];

    try {
      for (const pageId of selectedPageIds) {
        const markdown: string = await invoke("integration_notion_to_markdown", {
          apiKey: notionApiKey.trim(),
          pageId,
        });

        // Find the page title
        const page = notionPages.find((p) => p.id === pageId);
        const title = page?.title || "Untitled";

        // Save as a note via vault_write_note
        const sanitizedTitle = title
          .slice(0, 50)
          .replace(/[^a-zA-Z0-9\s\-_]/g, "_")
          .trim()
          .replace(/\s+/g, "-");
        const filename = `notion-${sanitizedTitle}-${Date.now()}.md`;

        await invoke("vault_write_note", {
          relativePath: filename,
          content: markdown,
        });

        importedNotes.push({
          id: filename,
          title,
          relative_path: filename,
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        importedCount++;
      }

      setResult({ count: importedCount });
      onImportComplete(importedNotes);
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
      setNotionApiStep("pages");
    }
  };

  const togglePageSelection = (pageId: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const toggleAllPages = () => {
    if (selectedPageIds.size === notionPages.length) {
      setSelectedPageIds(new Set());
    } else {
      setSelectedPageIds(new Set(notionPages.map((p) => p.id)));
    }
  };

  const handleClose = () => {
    if (importing) return;
    setSelectedSource(null);
    setError(null);
    setResult(null);
    resetNotionApiState();
    onClose();
  };

  const handleBack = () => {
    if (selectedSource === "notion_api" && notionApiStep === "pages") {
      setNotionApiStep("api_key");
      setSelectedPageIds(new Set());
      setError(null);
      return;
    }
    setSelectedSource(null);
    setError(null);
    setResult(null);
    resetNotionApiState();
  };

  // Determine the primary action button label
  const getActionButtonLabel = () => {
    if (importing) {
      if (selectedSource === "notion_api" && notionApiStep === "importing") {
        return `Importing ${selectedPageIds.size} page${selectedPageIds.size !== 1 ? "s" : ""}...`;
      }
      return `Importing from ${selectedSource ? SOURCE_INFO[selectedSource].label : ""}...`;
    }
    if (selectedSource === "notion_api") {
      if (notionApiStep === "api_key") return "Connect";
      if (notionApiStep === "pages") return `Import ${selectedPageIds.size} Page${selectedPageIds.size !== 1 ? "s" : ""}`;
    }
    return "Import";
  };

  const isActionDisabled = () => {
    if (importing) return true;
    if (!selectedSource) return true;
    if (selectedSource === "notion_api") {
      if (notionApiStep === "api_key") return !notionApiKey.trim();
      if (notionApiStep === "pages") return selectedPageIds.size === 0;
    }
    return false;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={handleClose}
    >
      <div
        className="rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
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
        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          {/* Notion API flow - API key step */}
          {selectedSource === "notion_api" && notionApiStep === "api_key" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={handleBack}
                  className="text-sm px-2 py-1 rounded hover:opacity-80"
                  style={{ color: "var(--accent)" }}
                >
                  ← Back
                </button>
              </div>
              <p
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Enter your Notion integration API key to connect. You can create one at{" "}
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)" }}
                >
                  notion.so/my-integrations
                </a>
              </p>
              <input
                type="password"
                value={notionApiKey}
                onChange={(e) => setNotionApiKey(e.target.value)}
                placeholder="ntn_..."
                className="w-full px-3 py-2 rounded text-sm"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSelectSource();
                }}
              />
            </div>
          )}

          {/* Notion API flow - Page selection step */}
          {selectedSource === "notion_api" && notionApiStep === "pages" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={handleBack}
                  className="text-sm px-2 py-1 rounded hover:opacity-80"
                  style={{ color: "var(--accent)" }}
                >
                  ← Back
                </button>
                <button
                  onClick={toggleAllPages}
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    backgroundColor: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {selectedPageIds.size === notionPages.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <p
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                {notionPages.length} page{notionPages.length !== 1 ? "s" : ""} found. Select pages to import.
              </p>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {notionPages.map((page) => {
                  const isSelected = selectedPageIds.has(page.id);
                  return (
                    <button
                      key={page.id}
                      onClick={() => togglePageSelection(page.id)}
                      className="w-full text-left px-3 py-2 rounded border transition-colors"
                      style={{
                        backgroundColor: isSelected ? "var(--bg-hover)" : "transparent",
                        borderColor: isSelected ? "var(--accent)" : "var(--border-color)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded border flex items-center justify-center text-xs"
                          style={{
                            borderColor: isSelected ? "var(--accent)" : "var(--border-color)",
                            backgroundColor: isSelected ? "var(--accent)" : "transparent",
                            color: isSelected ? "#ffffff" : "transparent",
                          }}
                        >
                          {isSelected ? "✓" : ""}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{page.title || "Untitled"}</div>
                          <div
                            className="text-xs truncate"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {page.parent_type} · {new Date(page.last_edited_time).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Source Selection (default view) */}
          {!(selectedSource === "notion_api" && (notionApiStep === "api_key" || notionApiStep === "pages")) &&
            (Object.keys(SOURCE_INFO) as ImportSource[]).map((source) => {
              const info = SOURCE_INFO[source];
              const isSelected = selectedSource === source;
              return (
                <button
                  key={source}
                  onClick={() => {
                    setSelectedSource(source);
                    setError(null);
                    setResult(null);
                    if (source === "notion_api") {
                      resetNotionApiState();
                    }
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
          {importing && selectedSource && !(selectedSource === "notion_api" && notionApiStep === "pages") && (
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
          className="flex items-center justify-end gap-2 px-5 py-4 border-t shrink-0"
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
              opacity: isActionDisabled() ? 0.5 : 1,
              cursor: isActionDisabled() ? "not-allowed" : "pointer",
            }}
            disabled={isActionDisabled()}
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
                {getActionButtonLabel()}
              </span>
            ) : (
              getActionButtonLabel()
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
