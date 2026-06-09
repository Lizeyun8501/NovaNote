import { useState, useMemo, useCallback } from "react";

interface NoteMeta {
  id: string;
  title: string;
  relative_path: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

type ViewMode = "table" | "cards";

interface TableViewProps {
  notes: NoteMeta[];
  onSelectNote: (note: NoteMeta) => void;
  onClose: () => void;
}

type SortField = "title" | "updated_at" | "created_at";
type SortDir = "asc" | "desc";

export default function TableView({ notes, onSelectNote, onClose }: TableViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterTag, setFilterTag] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach(n => n.tags.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [notes]);

  // Filter and sort notes
  const filteredNotes = useMemo(() => {
    let result = notes;

    // Filter by tag
    if (filterTag) {
      result = result.filter(n => n.tags.includes(filterTag));
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.relative_path.toLowerCase().includes(q)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "updated_at":
          cmp = a.updated_at.localeCompare(b.updated_at);
          break;
        case "created_at":
          cmp = a.created_at.localeCompare(b.created_at);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [notes, filterTag, searchQuery, sortField, sortDir]);

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }, [sortField]);

  const formatDate = (iso: string) => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return iso.slice(0, 10);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-secondary)" }}
      >
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-base">Database View</h2>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {filteredNotes.length} of {notes.length} notes
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          {(["table", "cards"] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="px-3 py-1 rounded text-xs font-medium transition-colors capitalize"
              style={{
                backgroundColor: viewMode === mode ? "var(--accent-color, #3b82f6)" : "var(--bg-hover)",
                color: viewMode === mode ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {mode === "table" ? "Table" : "Cards"}
            </button>
          ))}
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}
          >✕</button>
        </div>
      </div>

      {/* Filter bar */}
      <div
        className="flex items-center gap-3 px-5 py-2 border-b"
        style={{ borderColor: "var(--border-color)" }}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Filter notes..."
          className="px-3 py-1.5 rounded border text-sm w-48"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        />
        <select
          value={filterTag}
          onChange={e => setFilterTag(e.target.value)}
          className="px-3 py-1.5 rounded border text-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <option value="">All tags</option>
          {allTags.map(tag => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {viewMode === "table" ? (
          /* Table view */
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border-color)" }}>
                <th
                  className="text-left px-3 py-2 cursor-pointer select-none font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => toggleSort("title")}
                >
                  Title {sortField === "title" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th
                  className="text-left px-3 py-2 cursor-pointer select-none font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => toggleSort("updated_at")}
                >
                  Updated {sortField === "updated_at" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th
                  className="text-left px-3 py-2 cursor-pointer select-none font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => toggleSort("created_at")}
                >
                  Created {sortField === "created_at" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Tags
                </th>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Path
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredNotes.map(note => (
                <tr
                  key={note.id}
                  onClick={() => onSelectNote(note)}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid var(--border-color)" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <td className="px-3 py-2 font-medium">{note.title || note.relative_path}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{formatDate(note.updated_at)}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{formatDate(note.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {note.tags.slice(0, 3).map(tag => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "var(--accent-color, #3b82f6)20", color: "var(--accent-color, #3b82f6)" }}
                        >
                          {tag}
                        </span>
                      ))}
                      {note.tags.length > 3 && (
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>+{note.tags.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs truncate max-w-[200px]" style={{ color: "var(--text-muted)" }}>
                    {note.relative_path}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          /* Card view */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredNotes.map(note => (
              <div
                key={note.id}
                onClick={() => onSelectNote(note)}
                className="p-3 rounded-lg border cursor-pointer transition-colors"
                style={{
                  borderColor: "var(--border-color)",
                  backgroundColor: "var(--bg-secondary)",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent-color, #3b82f6)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-color)")}
              >
                <h3 className="font-medium text-sm truncate">{note.title || note.relative_path}</h3>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {note.relative_path}
                </p>
                <div className="flex gap-1 flex-wrap mt-2">
                  {note.tags.slice(0, 4).map(tag => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: "var(--accent-color, #3b82f6)20", color: "var(--accent-color, #3b82f6)" }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
                  Updated: {formatDate(note.updated_at)}
                </p>
              </div>
            ))}
          </div>
        )}

        {filteredNotes.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
            No notes match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
