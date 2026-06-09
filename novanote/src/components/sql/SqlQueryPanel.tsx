import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SqlQueryPanelProps {
  onClose: () => void;
}

const EXAMPLE_QUERIES = [
  "SELECT * FROM notes ORDER BY updated_at DESC LIMIT 20",
  "SELECT tag_name, COUNT(*) as count FROM note_tags GROUP BY tag_name ORDER BY count DESC",
  "SELECT n.title, n.relative_path FROM notes n JOIN note_tags nt ON n.id = nt.note_id WHERE nt.tag_name = '\"rust\"'",
  "SELECT source_path, target_path FROM links LIMIT 50",
  "SELECT relative_path FROM notes WHERE content LIKE '%TODO%'",
];

export default function SqlQueryPanel({ onClose }: SqlQueryPanelProps) {
  const [sql, setSql] = useState("SELECT * FROM notes ORDER BY updated_at DESC LIMIT 20");
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rowCount, setRowCount] = useState(0);

  const runQuery = useCallback(async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const rows: Record<string, unknown>[] = await invoke("vault_query_sql", { sql: sql.trim() });
      setRowCount(rows.length);
      if (rows.length > 0) {
        setColumns(Object.keys(rows[0]));
      } else {
        setColumns([]);
      }
      setResults(rows);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [sql]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[700px] max-h-[85vh] flex flex-col rounded-xl shadow-2xl overflow-hidden"
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
          <h2 className="font-semibold text-base">SQL Query</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: "var(--text-secondary)" }}
          >
            ✕
          </button>
        </div>

        {/* Query input */}
        <div className="p-4 flex flex-col gap-3">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="SELECT * FROM notes WHERE ..."
            rows={4}
            className="w-full px-3 py-2 rounded border text-sm font-mono resize-none"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                runQuery();
              }
            }}
          />

          <div className="flex items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {EXAMPLE_QUERIES.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setSql(q)}
                  className="text-[10px] px-2 py-1 rounded transition-colors"
                  style={{
                    backgroundColor: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  Example {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={runQuery}
              disabled={loading || !sql.trim()}
              className="px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--accent-color, #3b82f6)",
                color: "#fff",
              }}
            >
              {loading ? "Running..." : "Run (Ctrl+Enter)"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mx-4 p-3 rounded text-sm"
            style={{ backgroundColor: "#ef444410", color: "#ef4444", border: "1px solid #ef444430" }}
          >
            {error}
          </div>
        )}

        {/* Results */}
        {results !== null && (
          <div
            className="flex-1 overflow-auto border-t mx-0"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div
              className="px-4 py-2 text-xs flex items-center justify-between"
              style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-muted)" }}
            >
              <span>{rowCount} row{rowCount !== 1 ? "s" : ""}</span>
              <span>Ctrl+Enter to run</span>
            </div>

            {results.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      {columns.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 100).map((row, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid var(--border-color)",
                        }}
                      >
                        {columns.map((col) => (
                          <td
                            key={col}
                            className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate"
                            style={{ color: "var(--text-primary)" }}
                            title={String(row[col] ?? "")}
                          >
                            {String(row[col] ?? "NULL")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {results.length > 100 && (
                  <div
                    className="px-4 py-2 text-xs text-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Showing first 100 of {results.length} rows
                  </div>
                )}
              </div>
            ) : (
              <div
                className="px-4 py-8 text-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                No results
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}