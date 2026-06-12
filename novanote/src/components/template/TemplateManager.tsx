import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface BuiltInTemplate {
  name: string;
  description: string;
  content: string;
}

interface CustomTemplate {
  name: string;
  content: string;
}

interface TemplateManagerProps {
  onSelectTemplate: (content: string) => void;
  onSaveTemplate: (name: string, content: string) => void;
}

const builtInTemplates: BuiltInTemplate[] = [
  {
    name: "Daily Note",
    description: "Date heading + sections for Tasks, Notes, Reflection",
    content: `# {{date}}\n\n## Tasks\n\n- [ ] \n\n## Notes\n\n\n\n## Reflection\n\n\n`,
  },
  {
    name: "Meeting Notes",
    description: "Attendees, Agenda, Action Items, Notes",
    content: `# Meeting Notes\n\n**Date:** {{date}}\n**Attendees:** \n\n## Agenda\n\n1. \n\n## Notes\n\n\n\n## Action Items\n\n- [ ] \n\n`,
  },
  {
    name: "Project",
    description: "Overview, Goals, Timeline, Resources",
    content: `# Project: \n\n## Overview\n\n\n\n## Goals\n\n- \n\n## Timeline\n\n| Milestone | Date | Status |\n|-----------|------|--------|\n|  |  |  |\n\n## Resources\n\n- \n\n`,
  },
  {
    name: "Reading Note",
    description: "Title, Author, Key Takeaways, Quotes, Summary",
    content: `# Reading Note\n\n**Title:** \n**Author:** \n**Date Read:** {{date}}\n\n## Key Takeaways\n\n- \n\n## Quotes\n\n> \n\n## Summary\n\n\n\n`,
  },
  {
    name: "Blank",
    description: "Empty note",
    content: "",
  },
];

export default function TemplateManager({ onSelectTemplate, onSaveTemplate }: TemplateManagerProps) {
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<BuiltInTemplate | CustomTemplate | null>(null);
  const [saveMode, setSaveMode] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [tab, setTab] = useState<"builtin" | "custom">("builtin");
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCustomTemplates = useCallback(async () => {
    try {
      const names: string[] = await invoke("vault_list_templates");
      const templates: CustomTemplate[] = [];
      for (const name of names) {
        try {
          const content: string = await invoke("vault_get_template_content", { name });
          templates.push({ name, content });
        } catch {
          // Skip templates that fail to load
        }
      }
      if (mountedRef.current) {
        setCustomTemplates(templates);
      }
    } catch (err) {
      console.error("Failed to load custom templates:", err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadCustomTemplates();
  }, [loadCustomTemplates]);

  const handleSelectBuiltIn = (template: BuiltInTemplate) => {
    setSelectedTemplate(template);
  };

  const handleSelectCustom = (template: CustomTemplate) => {
    setSelectedTemplate(template);
  };

  const handleUseTemplate = () => {
    if (!selectedTemplate) return;
    // Replace {{date}} placeholder with today's date
    const today = new Date().toISOString().split("T")[0];
    const content = selectedTemplate.content.replace(/\{\{date\}\}/g, today);
    onSelectTemplate(content);
  };

  const handleSaveTemplate = useCallback(async () => {
    if (!templateName.trim()) return;
    try {
      await invoke("vault_save_as_template", { name: templateName.trim(), content: "" });
      onSaveTemplate(templateName.trim(), "");
      setSaveMode(false);
      setTemplateName("");
      await loadCustomTemplates();
    } catch (err) {
      console.error("Failed to save template:", err);
    }
  }, [templateName, onSaveTemplate, loadCustomTemplates]);

  const handleDeleteTemplate = async (name: string) => {
    try {
      await invoke("vault_delete_template", { name });
      await loadCustomTemplates();
      if (selectedTemplate && "name" in selectedTemplate && selectedTemplate.name === name) {
        setSelectedTemplate(null);
      }
    } catch (err) {
      console.error("Failed to delete template:", err);
    }
  };

  const previewContent = selectedTemplate
    ? selectedTemplate.content.replace(/\{\{date\}\}/g, new Date().toISOString().split("T")[0])
    : null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={() => onSelectTemplate("")}
    >
      <div
        className="rounded-lg shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-color)",
          width: "640px",
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <h2 className="text-base font-semibold">New Note from Template</h2>
          <button
            onClick={() => onSelectTemplate("")}
            className="text-sm px-2 py-1 rounded hover:opacity-80 border-none bg-transparent cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            Skip
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <button
            onClick={() => setTab("builtin")}
            className="px-4 py-2 text-sm font-medium border-none cursor-pointer"
            style={{
              backgroundColor: tab === "builtin" ? "var(--bg-hover)" : "transparent",
              color: tab === "builtin" ? "var(--text-primary)" : "var(--text-secondary)",
              borderBottom: tab === "builtin" ? "2px solid var(--accent-color)" : "2px solid transparent",
            }}
          >
            Built-in
          </button>
          <button
            onClick={() => setTab("custom")}
            className="px-4 py-2 text-sm font-medium border-none cursor-pointer"
            style={{
              backgroundColor: tab === "custom" ? "var(--bg-hover)" : "transparent",
              color: tab === "custom" ? "var(--text-primary)" : "var(--text-secondary)",
              borderBottom: tab === "custom" ? "2px solid var(--accent-color)" : "2px solid transparent",
            }}
          >
            Custom
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: "300px" }}>
          {/* Template list */}
          <div
            className="flex-1 overflow-y-auto p-2 border-r"
            style={{ borderColor: "var(--border-color)" }}
          >
            {tab === "builtin" ? (
              <ul className="space-y-1">
                {builtInTemplates.map((template) => (
                  <li key={template.name}>
                    <button
                      onClick={() => handleSelectBuiltIn(template)}
                      className="w-full text-left px-3 py-2 rounded text-sm transition-colors border-none cursor-pointer"
                      style={{
                        backgroundColor:
                          selectedTemplate?.name === template.name
                            ? "var(--bg-hover)"
                            : "transparent",
                        color: "var(--text-primary)",
                      }}
                      onMouseEnter={(e) => {
                        if (selectedTemplate?.name !== template.name) {
                          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedTemplate?.name !== template.name) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      <div className="font-medium">{template.name}</div>
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {template.description}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {loading ? (
                  <p
                    className="text-sm text-center py-4"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Loading...
                  </p>
                ) : customTemplates.length === 0 ? (
                  <div className="p-4 text-center">
                    <p
                      className="text-sm mb-3"
                      style={{ color: "var(--text-muted)" }}
                    >
                      No custom templates yet.
                    </p>
                    <button
                      onClick={() => setSaveMode(true)}
                      className="px-3 py-1.5 rounded text-sm border-none cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-hover)",
                        color: "var(--text-primary)",
                      }}
                    >
                      Save current note as template
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {customTemplates.map((template) => (
                      <li key={template.name} className="flex items-center gap-1">
                        <button
                          onClick={() => handleSelectCustom(template)}
                          className="flex-1 text-left px-3 py-2 rounded text-sm transition-colors border-none cursor-pointer"
                          style={{
                            backgroundColor:
                              selectedTemplate?.name === template.name
                                ? "var(--bg-hover)"
                                : "transparent",
                            color: "var(--text-primary)",
                          }}
                          onMouseEnter={(e) => {
                            if (selectedTemplate?.name !== template.name) {
                              e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (selectedTemplate?.name !== template.name) {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }
                          }}
                        >
                          {template.name}
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template.name)}
                          className="px-1.5 py-1 rounded text-xs border-none cursor-pointer bg-transparent"
                          style={{ color: "var(--text-muted)" }}
                          title="Delete template"
                        >
                          &times;
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-3">
            {previewContent !== null ? (
              <pre
                className="text-xs whitespace-pre-wrap font-mono"
                style={{ color: "var(--text-secondary)" }}
              >
                {previewContent || "(blank note)"}
              </pre>
            ) : (
              <p
                className="text-sm text-center py-8"
                style={{ color: "var(--text-muted)" }}
              >
                Select a template to preview
              </p>
            )}
          </div>
        </div>

        {/* Save template dialog */}
        {saveMode && (
          <div
            className="px-4 py-3 border-t flex items-center gap-2"
            style={{ borderColor: "var(--border-color)" }}
          >
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name..."
              className="flex-1 px-3 py-1.5 rounded text-sm border"
              style={{
                backgroundColor: "var(--bg-primary)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTemplate();
              }}
            />
            <button
              onClick={handleSaveTemplate}
              className="px-3 py-1.5 rounded text-sm font-medium border-none cursor-pointer"
              style={{
                backgroundColor: "var(--accent-color, #4f46e5)",
                color: "#fff",
              }}
            >
              Save
            </button>
            <button
              onClick={() => {
                setSaveMode(false);
                setTemplateName("");
              }}
              className="px-3 py-1.5 rounded text-sm border-none cursor-pointer"
              style={{
                backgroundColor: "var(--bg-hover)",
                color: "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-3 border-t"
          style={{ borderColor: "var(--border-color)" }}
        >
          <button
            onClick={() => setSaveMode(true)}
            className="px-3 py-1.5 rounded text-sm border-none cursor-pointer"
            style={{
              backgroundColor: "var(--bg-hover)",
              color: "var(--text-primary)",
            }}
          >
            Save Current as Template
          </button>
          <button
            onClick={handleUseTemplate}
            disabled={!selectedTemplate}
            className="px-4 py-1.5 rounded text-sm font-medium border-none cursor-pointer"
            style={{
              backgroundColor: selectedTemplate ? "var(--accent-color, #4f46e5)" : "var(--bg-hover)",
              color: selectedTemplate ? "#fff" : "var(--text-muted)",
              opacity: selectedTemplate ? 1 : 0.6,
            }}
          >
            Use Template
          </button>
        </div>
      </div>
    </div>
  );
}
