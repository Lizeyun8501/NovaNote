import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";

interface ActionBarProps {
  onOpenVault: () => void;
  onNewNote: () => void;
  onNewCanvas?: () => void;
  onOpenDailyNote?: () => void;
  onOpenTemplateSelector?: () => void;
  onImport?: () => void;
  onOpenAI?: () => void;
  onOpenCalendar?: () => void;
  onOpenPlugins?: () => void;
}

export default function ActionBar({
  onOpenVault,
  onNewNote,
  onNewCanvas,
  onOpenDailyNote,
  onOpenTemplateSelector,
  onImport,
  onOpenAI,
  onOpenCalendar,
  onOpenPlugins,
}: ActionBarProps) {
  const { t } = useTranslation();

  const handleOpenVault = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("actionBar.selectVaultDirectory"),
    });
    if (selected) {
      const path = typeof selected === "string" ? selected : selected;
      localStorage.setItem("novanote-vault", path);
      onOpenVault();
    }
  };

  return (
    <div
      className="flex items-center gap-1 px-2 py-2 border-b flex-wrap"
      style={{ borderColor: "var(--border-color)" }}
    >
      <button
        onClick={onNewNote}
        className="flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors"
        style={{
          backgroundColor: "var(--accent)",
          color: "#ffffff",
        }}
        title={t("actionBar.newNote")}
      >
        {t("actionBar.newNote")}
      </button>
      {onNewCanvas && (
        <button
          onClick={onNewCanvas}
          className="px-3 py-1.5 rounded text-sm transition-colors"
          style={{
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-secondary)",
          }}
          title={t("actionBar.newCanvas")}
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
        title={t("actionBar.openVault")}
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
          title={t("actionBar.dailyNote")}
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
          title={t("actionBar.templates")}
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
          title={t("actionBar.import")}
        >
          ⬇
        </button>
      )}
      {onOpenAI && (
        <button
          onClick={onOpenAI}
          className="px-3 py-1.5 rounded text-sm transition-colors"
          style={{
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-secondary)",
          }}
          title={t("actionBar.aiAssistant")}
        >
          🤖
        </button>
      )}
      {onOpenCalendar && (
        <button
          onClick={onOpenCalendar}
          className="px-3 py-1.5 rounded text-sm transition-colors"
          style={{
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-secondary)",
          }}
          title={t("actionBar.calendar")}
        >
          📆
        </button>
      )}
      {onOpenPlugins && (
        <button
          onClick={onOpenPlugins}
          className="px-3 py-1.5 rounded text-sm transition-colors"
          style={{
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-secondary)",
          }}
          title={t("actionBar.plugins")}
        >
          🧩
        </button>
      )}
    </div>
  );
}