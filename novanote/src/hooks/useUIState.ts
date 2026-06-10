import { useState } from "react";

export function useUIState() {
  const [showGraph, setShowGraph] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [canvasPath, setCanvasPath] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showPluginMarket, setShowPluginMarket] = useState(false);
  const [showSqlQuery, setShowSqlQuery] = useState(false);
  const [showMindMap, setShowMindMap] = useState(false);
  const [showTableView, setShowTableView] = useState(false);
  const [aiSelectedText, setAiSelectedText] = useState<string>("");

  /** Close all panels to return to the main editor view */
  const closeAllPanels = () => {
    setShowGraph(false);
    setShowTemplateSelector(false);
    setShowTemplateManager(false);
    setShowOutline(false);
    setShowImportWizard(false);
    setCommandPaletteOpen(false);
    setShowSyncSettings(false);
    setShowPasswordSetup(false);
    setShowAIPanel(false);
    setShowCalendar(false);
    setShowPluginMarket(false);
    setShowSqlQuery(false);
    setShowMindMap(false);
    setShowTableView(false);
  };

  return {
    // states
    showGraph,
    showTemplateSelector,
    showTemplateManager,
    showOutline,
    showImportWizard,
    canvasPath,
    commandPaletteOpen,
    showSyncSettings,
    showPasswordSetup,
    showAIPanel,
    showCalendar,
    showPluginMarket,
    showSqlQuery,
    showMindMap,
    showTableView,
    aiSelectedText,
    // setters (return setXxx directly for toggles; closeAllPanels for bulk)
    setShowGraph,
    setShowTemplateSelector,
    setShowTemplateManager,
    setShowOutline,
    setShowImportWizard,
    setCanvasPath,
    setCommandPaletteOpen,
    setShowSyncSettings,
    setShowPasswordSetup,
    setShowAIPanel,
    setShowCalendar,
    setShowPluginMarket,
    setShowSqlQuery,
    setShowMindMap,
    setShowTableView,
    setAiSelectedText,
    closeAllPanels,
  };
}