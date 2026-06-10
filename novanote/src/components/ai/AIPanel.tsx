import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

interface AIPanelProps {
  currentNotePath: string | null;
  selectedText?: string;
  onTagsGenerated?: (tags: string[]) => void;
  onSummaryGenerated?: (summary: string) => void;
  onWritingResult?: (text: string) => void;
  onNavigateToNote?: (path: string) => void;
  onClose: () => void;
}

interface RagSource {
  note_path: string;
  relevance_score: number;
  snippet: string;
}

interface RagAnswer {
  answer: string;
  sources: RagSource[];
  model: string;
}

type TabId = "tags" | "summary" | "writing" | "rag";

export default function AIPanel({
  currentNotePath,
  selectedText,
  onTagsGenerated,
  onSummaryGenerated,
  onWritingResult,
  onNavigateToNote,
  onClose,
}: AIPanelProps) {
  const { t } = useTranslation();
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

  // RAG Q&A
  const [ragQuery, setRagQuery] = useState("");
  const [ragAnswer, setRagAnswer] = useState<RagAnswer | null>(null);

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

  const performRagQuery = useCallback(async () => {
    const q = ragQuery.trim();
    if (!q) {
      setError("Please enter a question.");
      return;
    }
    setLoading(true);
    setError("");
    setRagAnswer(null);
    setResult("");
    try {
      const res: RagAnswer = await invoke("ai_rag_query", {
        query: q,
        baseUrl,
        model,
      });
      setRagAnswer(res);
      setResult(res.answer);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, model, ragQuery]);

  const handleSourceClick = useCallback(
    (path: string) => {
      onNavigateToNote?.(path);
    },
    [onNavigateToNote]
  );

  const tabLabels: Record<TabId, string> = {
    tags: t("ai.tags"),
    summary: t("ai.summary"),
    writing: t("ai.writing"),
    rag: t("ai.rag"),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[560px] max-h-[85vh] flex flex-col rounded-xl shadow-2xl overflow-hidden"
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
          <h2 className="font-semibold text-base">{t("ai.title")}</h2>
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
            placeholder={t("ai.model")}
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
            {ollamaStatus === "unknown" ? t("ai.test") : ollamaStatus === "connected" ? t("ai.connected") : t("ai.disconnected")}
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          {(["tags", "summary", "writing", "rag"] as TabId[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setResult("");
                setError("");
                if (tab !== "rag") setRagAnswer(null);
              }}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                color: activeTab === tab ? "var(--accent-color, #3b82f6)" : "var(--text-secondary)",
                borderBottom: activeTab === tab ? "2px solid var(--accent-color, #3b82f6)" : "2px solid transparent",
              }}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Tags tab */}
          {activeTab === "tags" && (
            <>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("ai.generatingTagsDesc")}
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
                {loading ? t("ai.generating") : t("ai.generateTags")}
              </button>
            </>
          )}

          {/* Summary tab */}
          {activeTab === "summary" && (
            <>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("ai.generatingSummaryDesc")}
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
                {loading ? t("ai.summarizing") : t("ai.generateSummary")}
              </button>
            </>
          )}

          {/* Writing assist tab */}
          {activeTab === "writing" && (
            <>
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: "polish", label: t("ai.polish") },
                  { id: "continue", label: t("ai.continue") },
                  { id: "translate_to_chinese", label: t("ai.toChinese") },
                  { id: "translate_to_english", label: t("ai.toEnglish") },
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
                placeholder={t("ai.writingPlaceholder")}
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
                {loading ? t("ai.processing") : t("ai.run")}
              </button>
            </>
          )}

          {/* RAG Q&A tab */}
          {activeTab === "rag" && (
            <>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("ai.ragDesc")}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !loading) {
                      e.preventDefault();
                      performRagQuery();
                    }
                  }}
                  placeholder={t("ai.ragPlaceholder")}
                  className="flex-1 px-3 py-2 rounded border text-sm"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  onClick={performRagQuery}
                  disabled={loading || !ragQuery.trim()}
                  className="px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--accent-color, #3b82f6)",
                    color: "#fff",
                  }}
                >
                  {loading ? t("ai.searching") : t("ai.ask")}
                </button>
              </div>

              {/* RAG Answer */}
              {ragAnswer && (
                <div className="flex flex-col gap-3">
                  {/* Answer */}
                  <div
                    className="p-3 rounded text-sm whitespace-pre-wrap"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {ragAnswer.answer}
                  </div>

                  {/* Source citations */}
                  {ragAnswer.sources.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        {t("ai.sources", { count: ragAnswer.sources.length })}
                      </span>
                      {ragAnswer.sources.map((source, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col gap-1 p-2 rounded text-xs"
                          style={{
                            backgroundColor: "var(--bg-secondary)",
                            border: "1px solid var(--border-color)",
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSourceClick(source.note_path)}
                              className="font-medium hover:underline"
                              style={{ color: "var(--accent-color, #3b82f6)" }}
                            >
                              {source.note_path}
                            </button>
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px]"
                              style={{
                                backgroundColor: "#3b82f620",
                                color: "#3b82f6",
                              }}
                            >
                              {(source.relevance_score * 100).toFixed(0)}% match
                            </span>
                          </div>
                          <p
                            className="line-clamp-2"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {source.snippet}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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

          {/* Result (non-RAG tabs) */}
          {result && activeTab !== "rag" && (
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
