import { useTranslation } from "react-i18next";

interface WelcomeScreenProps {
  onNewNote?: () => void;
  onOpenDailyNote?: () => void;
  onOpenGraph?: () => void;
  hasVault: boolean;
}

export default function WelcomeScreen({
  onNewNote,
  onOpenDailyNote,
  onOpenGraph,
  hasVault,
}: WelcomeScreenProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex-1 flex items-center justify-center p-8"
      style={{
        background: "var(--gradient-hero)",
      }}
    >
      <div className="max-w-md w-full text-center">
        {/* Logo */}
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: "var(--gradient-accent)", boxShadow: "var(--shadow-lg)" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>

        {/* Title */}
        <h1
          className="text-3xl font-bold mb-2 tracking-tight"
          style={{
            background: "var(--gradient-accent)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          NovaNote
        </h1>
        <p className="text-base mb-8" style={{ color: "var(--text-muted)" }}>
          {hasVault
            ? t("app.welcome.withVault", "Select a note to begin editing")
            : t("app.welcome.noVault", "Open a vault to get started")}
        </p>

        {/* Quick Actions */}
        {hasVault && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {onNewNote && (
              <QuickActionCard
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                }
                label={t("actionBar.newNote")}
                onClick={onNewNote}
              />
            )}
            {onOpenDailyNote && (
              <QuickActionCard
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                }
                label={t("actionBar.dailyNote")}
                onClick={onOpenDailyNote}
              />
            )}
            {onOpenGraph && (
              <QuickActionCard
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                }
                label={t("graph.title")}
                onClick={onOpenGraph}
              />
            )}
          </div>
        )}

        {/* Keyboard shortcut hint */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-muted)" }}>
          <kbd
            className="px-1.5 py-0.5 rounded text-[10px] font-mono"
            style={{ backgroundColor: "var(--bg-hover)", border: "1px solid var(--border-color)" }}
          >
            Ctrl+P
          </kbd>
          <span>{t("commandPalette.open")}</span>
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] border"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--border-color)",
        boxShadow: "var(--shadow-sm)",
        color: "var(--text-primary)",
      }}
    >
      <div style={{ color: "var(--accent)" }}>{icon}</div>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
