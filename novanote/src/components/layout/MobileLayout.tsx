import { useState } from "react";
import { useTranslation } from "react-i18next";

interface MobileLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  onOpenSearch?: () => void;
  onOpenAI?: () => void;
  onOpenCalendar?: () => void;
  onOpenMore?: () => void;
}

export function MobileLayout({
  children,
  sidebar,
  onOpenSearch,
  onOpenAI,
  onOpenCalendar,
  onOpenMore,
}: MobileLayoutProps) {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Mobile sidebar overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Mobile sidebar */}
      <div className={`sidebar-mobile ${sidebarOpen ? "open" : ""}`}>
        {sidebar}
      </div>

      {/* Header with menu button */}
      <header className="mobile-editor-header">
        <button
          className="mobile-menu-btn clickable"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ color: "var(--text-primary)", fontSize: "1.5rem" }}
        >
          ☰
        </button>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          NovaNote
        </span>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Bottom nav */}
      <nav className="mobile-bottom-nav">
        <button
          className="active"
          onClick={() => setSidebarOpen(true)}
        >
          <span>📁</span>
          <span>{t("mobile.files")}</span>
        </button>
        <button onClick={onOpenSearch}>
          <span>🔍</span>
          <span>{t("mobile.search")}</span>
        </button>
        <button onClick={onOpenAI}>
          <span>🤖</span>
          <span>{t("mobile.ai")}</span>
        </button>
        <button onClick={onOpenCalendar}>
          <span>📅</span>
          <span>{t("mobile.calendar")}</span>
        </button>
        <button onClick={onOpenMore}>
          <span>⋯</span>
          <span>{t("mobile.more")}</span>
        </button>
      </nav>
    </div>
  );
}