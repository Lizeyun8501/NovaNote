import { open } from "@tauri-apps/plugin-dialog";

interface ActionBarProps {
  onOpenVault: () => void;
  onNewNote: () => void;
}

export default function ActionBar({ onOpenVault, onNewNote }: ActionBarProps) {
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
    </div>
  );
}