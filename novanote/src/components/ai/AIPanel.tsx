import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AIPanelProps {
  currentNotePath: string | null;
  selectedText?: string;
  onTagsGenerated?: (tags: string[]) => void;
  onSummaryGenerated?: (summary: string) => void;
  onWritingResult?: (text: string) => void;
  onClose: () => void;
}

type TabId = "tags" | "summary" | "writing";

export default function AIPanel({
  currentNotePath,
  selectedText,
  onTagsGenerated,
  onSummaryGenerated,
  onWritingResult,
  onClose,
}: AIPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("tags");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [model, setModel] = useState("llama3.2");
  const [ollamaStatus, setOllamaStatus] = useState<"unknown" | "connected" | "disconnected">("unknown");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Writing assist mode
  const [writingMode, setWritingMode] = useState("polish");
  const [writingText, setWritingText] = useState(selectedText || "");

  const checkConnection = useCallback(async () => {
    try {
      const connected: boolean = await invoke("ai_check_ollama", { baseUrl });
      setOllamaStatus(connected ? "connected" : "disconnected");
    } catch {
      setOllamaStatus("disconnected");
    }
  }, [baseUrl]);

  const generateTags = useCallback(async () => {
    if (!currentNotePath) {
      setError("No note is currently open.");
      return;
    }
    setLoading(true);
    setError("");
    setResult("");
    try {
      const res: { tags: string[]; confidence: number } = await invoke("ai_generate_tags", {
        baseUrl,
        model,
        relativePath: currentNotePath,
      });
      setResult(`Tags: ${res.tags.join(", ")}`);
      onTagsGenerated?.(res.tags);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, model, currentNotePath, onTagsGenerated]);

  const generateSummary = useCallback(async () => {
    if (!currentNotePath) {
      setError("No note is currently open.");
      return;
    }
    setLoading(true);
    setError("");
    setResult("");
    try {
      const res: { summary: string; model: string } = await invoke("ai_summarize", {
        baseUrl,
        model,
        relativePath: currentNotePath,
      });
      setResult(res.summary);
      onSummaryGenerated?.(res.summary);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, model, currentNotePath, onSummaryGenerated]);

  const writingAssist = useCallback(async () => {
    const text = writingText.trim();
    if (!text) {
      setError("No text selected for writing assistance.");
      return;
    }
    setLoading(true);
    setError("");
    setResult("");
    try {
      const res: { text: string; mode: string } = await invoke("ai_writing_assist", {
        baseUrl,
        model,
        text,
        mode: writingMode,
      });
      setResult(res.text);
      onWritingResult?.(res.text);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, model, writingText, writingMode, onWritingResult]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[520px] max-h-[80vh] flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <h2 className="font-semibold text-base">AI Assistant</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: "var(--text-secondary)" }}
          >
            ✕
          </button>
        </div>

        {/* Config bar */}
        <div
          className="flex items-center gap-3 px-5 py-3 border-b text-sm"
          style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-secondary)" }}
        >
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Ollama URL"
            className="flex-1 px-2 py-1.5 rounded border text-sm"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          />
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model"
            className="w-32 px-2 py-1.5 rounded border text-sm"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          />
          <button
            onClick={checkConnection}
            className="px-2 py-1.5 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor:
                ollamaStatus === "connected"
                  ? "#22c55e20"
                  : ollamaStatus === "disconnected"
                    ? "#ef444420"
                    : "var(--bg-hover)",
              color:
                ollamaStatus === "connected"
                  ? "#22c55e"
                  : ollamaStatus === "disconnected"
                    ? "#ef4444"
                    : "var(--text-secondary)",
              border: "1px solid var(--border-color)",
            }}
          >
            {ollamaStatus === "unknown" ? "Test" : ollamaStatus === "connected" ? "OK" : "Offline"}
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          {(["tags", "summary", "writing"] as TabId[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setResult("");
                setError("");
              }}
              className="px-4 py-2 text-sm font-medium transition-colors capitalize"
              style={{
                color: activeTab === tab ? "var(--accent-color, #3b82f6)" : "var(--text-secondary)",
                borderBottom: activeTab === tab ? "2px solid var(--accent-color, #3b82f6)" : "2px solid transparent",
              }}
            >
              {tab === "tags" ? "Smart Tags" : tab === "summary" ? "Summarize" : "Writing Assist"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Tags tab */}
          {activeTab === "tags" && (
            <>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Generate smart tags for the current note using AI.
              </p>
              <button
                onClick={generateTags}
                disabled={loading || !currentNotePath}
                className="px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: "var(--accent-color, #3b82f6)",
                  color: "#fff",
                }}
              >
                {loading ? "Generating..." : "Generate Tags"}
              </button>
            </>
          )}

          {/* Summary tab */}
          {activeTab === "summary" && (
            <>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Generate a concise summary of the current note.
              </p>
              <button
                onClick={generateSummary}
                disabled={loading || !currentNotePath}
                className="px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: "var(--accent-color, #3b82f6)",
                  color: "#fff",
                }}
              >
                {loading ? "Summarizing..." : "Generate Summary"}
              </button>
            </>
          )}

          {/* Writing assist tab */}
          {activeTab === "writing" && (
            <>
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: "polish", label: "Polish" },
                  { id: "continue", label: "Continue" },
                  { id: "translate_to_chinese", label: "→ Chinese" },
                  { id: "translate_to_english", label: "→ English" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setWritingMode(m.id)}
                    className="px-3 py-1 rounded text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: writingMode === m.id ? "var(--accent-color, #3b82f6)" : "var(--bg-hover)",
                      color: writingMode === m.id ? "#fff" : "var(--text-secondary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <textarea
                value={writingText}
                onChange={(e) => setWritingText(e.target.value)}
                placeholder="Enter or paste text for AI assistance..."
                rows={5}
                className="w-full px-3 py-2 rounded border text-sm resize-none"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                onClick={writingAssist}
                disabled={loading || !writingText.trim()}
                className="px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: "var(--accent-color, #3b82f6)",
                  color: "#fff",
                }}
              >
                {loading ? "Processing..." : "Run"}
              </button>
            </>
          )}

          {/* Error */}
          {error && (
            <div
              className="p-3 rounded text-sm"
              style={{ backgroundColor: "#ef444410", color: "#ef4444", border: "1px solid #ef444430" }}
            >
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className="p-3 rounded text-sm whitespace-pre-wrap max-h-48 overflow-y-auto"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}