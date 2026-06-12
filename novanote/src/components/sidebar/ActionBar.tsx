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
    <div className="flex flex-col gap-0.5 px-2 py-2 border-b" style={{ borderColor: "var(--border-color)" }}>
      {/* Primary: New Note */}
      <ActionItem
        onClick={onNewNote}
        title={t("actionBar.newNote")}
        accent
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </ActionItem>

      <ActionItem onClick={handleOpenVault} title={t("actionBar.openVault")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </ActionItem>

      {onNewCanvas && (
        <ActionItem onClick={onNewCanvas} title={t("actionBar.newCanvas")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </ActionItem>
      )}

      {onOpenDailyNote && (
        <ActionItem onClick={onOpenDailyNote} title={t("actionBar.dailyNote")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </ActionItem>
      )}

      {onOpenTemplateSelector && (
        <ActionItem onClick={onOpenTemplateSelector} title={t("actionBar.templates")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
        </ActionItem>
      )}

      {onImport && (
        <ActionItem onClick={onImport} title={t("actionBar.import")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </ActionItem>
      )}

      {/* Divider */}
      <div className="w-full h-px my-1" style={{ backgroundColor: "var(--border-color)" }} />

      {onOpenAI && (
        <ActionItem onClick={onOpenAI} title={t("actionBar.aiAssistant")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a2 2 0 0 1 2 2c0 1.1-.9 2-2 2a2 2 0 0 1-2-2c0-1.1.9-2 2-2z" />
            <path d="M12 12c2.2 0 4-1.8 4-4V6c0-2.2-1.8-4-4-4S8 3.8 8 6v2c0 2.2 1.8 4 4 4z" />
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </ActionItem>
      )}

      {onOpenCalendar && (
        <ActionItem onClick={onOpenCalendar} title={t("actionBar.calendar")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <circle cx="12" cy="16" r="2" />
          </svg>
        </ActionItem>
      )}

      {onOpenPlugins && (
        <ActionItem onClick={onOpenPlugins} title={t("actionBar.plugins")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </ActionItem>
      )}
    </div>
  );
}

function ActionItem({
  children,
  onClick,
  title,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void | Promise<void>;
  title: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
      style={{
        background: accent ? "var(--gradient-accent)" : "transparent",
        color: accent ? "#fff" : "var(--text-secondary)",
      }}
      title={title}
    >
      <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
        {children}
      </span>
      <span className="truncate">{title}</span>
    </button>
  );
}