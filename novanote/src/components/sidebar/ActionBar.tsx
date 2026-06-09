import { open } from "@tauri-apps/plugin-dialog";

interface ActionBarProps {
  onOpenVault: () => void;
  onNewNote: () => void;
  onNewCanvas?: () => void;
  onOpenDailyNote?: () => void;
  onOpenTemplateSelector?: () => void;
  onImport?: () => void;
}

export default function ActionBar({ onOpenVault, onNewNote, onNewCanvas, onOpenDailyNote, onOpenTemplateSelector, onImport }: ActionBarProps) {
  const handleOpenVault = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select a vault directory",
    });
    if (selected) {
      const path = typeof selected === "string" ? selected : selected;
      localStorage.setItem("novanote-vault", path);
      onOpenVault();
    }
  };

  return (
    <div
      className="flex items-center gap-1 px-3 py-2 border-b"
      style={{ borderColor: "var(--border-color)" }}
    >
      <button
        onClick={onNewNote}
        className="flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors"
        style={{
          backgroundColor: "var(--accent)",
          color: "#ffffff",
        }}
        title="New Note"
      >
        + New
      </button>
      {onNewCanvas && (
        <button
          onClick={onNewCanvas}
          className="px-3 py-1.5 rounded text-sm transition-colors"
          style={{
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-secondary)",
          }}
          title="New Canvas"
        >
          🎨
        </button>
      )}
      <button
        onClick={handleOpenVault}
        className="px-3 py-1.5 rounded text-sm transition-colors"
        style={{
          backgroundColor: "var(--bg-hover)",
          color: "var(--text-secondary)",
        }}
        title="Open Vault"
      >
        📂
      </button>
      {onOpenDailyNote && (
        <button
          onClick={onOpenDailyNote}
          className="px-3 py-1.5 rounded text-sm transition-colors"
          style={{
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-secondary)",
          }}
          title="Daily Note"
        >
          📅
        </button>
      )}
      {onOpenTemplateSelector && (
        <button
          onClick={onOpenTemplateSelector}
          className="px-3 py-1.5 rounded text-sm transition-colors"
          style={{
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-secondary)",
          }}
          title="Templates"
        >
          📋
        </button>
      )}
      {onImport && (
        <button
          onClick={onImport}
          className="px-3 py-1.5 rounded text-sm transition-colors"
          style={{
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-secondary)",
          }}
          title="Import Notes"
        >
          ⬇
        </button>
      )}
    </div>
  );
}