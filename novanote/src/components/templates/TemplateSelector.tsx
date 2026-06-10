import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TemplateSelectorProps {
  onSelect: (content: string) => void;
  onSaveAsTemplate: () => void;
  onClose: () => void;
}

export default function TemplateSelector({ onSelect, onSaveAsTemplate, onClose }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTemplates() {
      try {
        const list: string[] = await invoke("vault_list_templates");
        setTemplates(list);
      } catch (err) {
        console.error("Failed to load templates:", err);
      } finally {
        setLoading(false);
      }
    }
    loadTemplates();
  }, []);

  const handleSelect = async (name: string) => {
    try {
      const content: string = await invoke("vault_get_template_content", { name });
      onSelect(content);
    } catch (err) {
      console.error("Failed to load template content:", err);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl w-96 max-h-[80vh] flex flex-col"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <h2 className="text-base font-semibold">Templates</h2>
          <button
            onClick={onClose}
            className="text-sm px-2 py-1 rounded hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
              Loading...
            </p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
              No templates yet. Save a note as a template to get started.
            </p>
          ) : (
            <ul className="space-y-1">
              {templates.map((name) => (
                <li key={name}>
                  <button
                    onClick={() => handleSelect(name)}
                    className="w-full text-left px-3 py-2 rounded text-sm transition-colors"
                    style={{
                      backgroundColor: "transparent",
                      color: "var(--text-primary)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    📄 {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="px-4 py-3 border-t"
          style={{ borderColor: "var(--border-color)" }}
        >
          <button
            onClick={onSaveAsTemplate}
            className="w-full px-3 py-2 rounded text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--bg-hover)",
              color: "var(--text-primary)",
            }}
          >
            💾 Save Current as Template
          </button>
        </div>
      </div>
    </div>
  );
}
