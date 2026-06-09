import { useState } from "react";

interface MobileLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}

export function MobileLayout({ children, sidebar }: MobileLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Mobile sidebar overlay */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      
      {/* Mobile sidebar */}
      <div className={`sidebar-mobile ${sidebarOpen ? 'open' : ''}`}>
        {sidebar}
      </div>
      
      {/* Header with menu button */}
      <header className="mobile-editor-header">
        <button 
          className="mobile-menu-btn clickable"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ color: 'var(--text-primary)', fontSize: '1.5rem' }}
        >
          ☰
        </button>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          NovaNote
        </span>
      </header>
      
      {/* Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      
      {/* Bottom nav */}
      <nav className="mobile-bottom-nav">
        <button 
          className="active"
          onClick={() => setSidebarOpen(true)}
        >
          <span>📁</span>
          <span>Files</span>
        </button>
        <button>
          <span>🔍</span>
          <span>Search</span>
        </button>
        <button>
          <span>🏷️</span>
          <span>Tags</span>
        </button>
        <button>
          <span>⚙️</span>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}