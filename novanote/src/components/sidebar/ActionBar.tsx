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
    <div className="flex flex-col gap-2 px-3 py-3 border-b" style={{ borderColor: "var(--border-color)" }}>
      {/* Primary action: New Note */}
      <button
        onClick={onNewNote}
        className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
        style={{
          background: "var(--gradient-accent)",
          boxShadow: "var(--shadow-sm)",
        }}
        title={t("actionBar.newNote")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {t("actionBar.newNote")}
      </button>

      {/* Quick actions grid */}
      <div className="flex items-center gap-1">
        <ActionButton
          onClick={handleOpenVault}
          title={t("actionBar.openVault")}
          tooltip={t("actionBar.openVault")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </ActionButton>

        {onNewCanvas && (
          <ActionButton onClick={onNewCanvas} title={t("actionBar.newCanvas")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </ActionButton>
        )}

        {onOpenDailyNote && (
          <ActionButton onClick={onOpenDailyNote} title={t("actionBar.dailyNote")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </ActionButton>
        )}

        {onOpenTemplateSelector && (
          <ActionButton onClick={onOpenTemplateSelector} title={t("actionBar.templates")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          </ActionButton>
        )}

        {onImport && (
          <ActionButton onClick={onImport} title={t("actionBar.import")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </ActionButton>
        )}

        <div className="flex-1" />

        {onOpenAI && (
          <ActionButton onClick={onOpenAI} title={t("actionBar.aiAssistant")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.9 2-2 2h-4a2 2 0 0 1-2-2 4 4 0 0 1 4-4z" />
              <path d="M12 8v4" />
              <path d="M8 12h8l1 10H7l1-8z" />
            </svg>
          </ActionButton>
        )}

        {onOpenCalendar && (
          <ActionButton onClick={onOpenCalendar} title={t("actionBar.calendar")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <circle cx="12" cy="16" r="2" />
            </svg>
          </ActionButton>
        )}

        {onOpenPlugins && (
          <ActionButton onClick={onOpenPlugins} title={t("actionBar.plugins")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 min-w-0 px-2 py-2 rounded-lg text-sm transition-all duration-150 hover:opacity-80 active:scale-[0.95] flex items-center justify-center"
      style={{
        backgroundColor: "var(--bg-hover)",
        color: "var(--text-secondary)",
      }}
      title={title}
    >
      {children}
    </button>
  );
}
