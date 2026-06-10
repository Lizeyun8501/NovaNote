import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  status: "loaded" | "unloaded" | "error";
  installed: boolean;
}

interface PluginMarketProps {
  isOpen: boolean;
  onClose: () => void;
}

// Mock available plugins for the "market" (in a real app, this would come from a server)
const MARKETPLACE_PLUGINS: Array<{ name: string; version: string; description: string; author: string; downloads: number; rating: number }> = [
  {
    name: "word-counter",
    version: "1.0.0",
    description: "Shows word and character count for the current note in the status bar.",
    author: "novanote-team",
    downloads: 1240,
    rating: 4.5,
  },
  {
    name: "todo-aggregator",
    version: "0.2.0",
    description: "Collects all TODO items across notes and presents them in a sidebar panel.",
    author: "community",
    downloads: 890,
    rating: 4.2,
  },
  {
    name: "markdown-exporter",
    version: "1.1.0",
    description: "Export notes to PDF, DOCX, and other formats with custom templates.",
    author: "novanote-team",
    downloads: 2100,
    rating: 4.8,
  },
  {
    name: "daily-review",
    version: "0.1.5",
    description: "Daily review assistant that reminds you to review daily notes and creates summaries.",
    author: "community",
    downloads: 567,
    rating: 4.0,
  },
  {
    name: "kanban-view",
    version: "0.3.0",
    description: "View tasks from your notes in a Kanban board layout.",
    author: "community",
    downloads: 1450,
    rating: 4.6,
  },
];

type TabId = "market" | "installed";

export default function PluginMarket({ isOpen, onClose }: PluginMarketProps) {
  const [activeTab, setActiveTab] = useState<TabId>("market");
  const [installedPlugins, setInstalledPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Load installed plugins
  const loadInstalledPlugins = useCallback(async () => {
    try {
      const plugins: PluginInfo[] = await invoke("plugin_list");
      setInstalledPlugins(plugins);
    } catch (err: unknown) {
      console.error("Failed to list plugins:", err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadInstalledPlugins();
    }
  }, [isOpen, loadInstalledPlugins]);

  // Install plugin
  const handleInstall = useCallback(async (pluginName: string) => {
    setLoading(true);
    setError("");
    try {
      await invoke("plugin_install", { name: pluginName });
      await loadInstalledPlugins();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [loadInstalledPlugins]);

  // Uninstall plugin
  const handleUninstall = useCallback(async (pluginId: string) => {
    setLoading(true);
    setError("");
    try {
      await invoke("plugin_uninstall", { pluginId });
      await loadInstalledPlugins();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [loadInstalledPlugins]);

  // Toggle enable/disable
  const handleToggle = useCallback(async (pluginId: string, currentStatus: string) => {
    setLoading(true);
    setError("");
    try {
      if (currentStatus === "loaded") {
        await invoke("plugin_disable", { pluginId });
      } else {
        await invoke("plugin_enable", { pluginId });
      }
      await loadInstalledPlugins();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [loadInstalledPlugins]);

  // Filter marketplace plugins by search
  const filteredMarketPlugins = MARKETPLACE_PLUGINS.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
  });

  // Check if a marketplace plugin is installed
  const isInstalled = (name: string) => installedPlugins.some((p) => p.name === name);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[560px] max-h-[80vh] flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <h2 className="font-semibold text-base">Plugin Marketplace</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: "var(--text-secondary)" }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          {(["market", "installed"] as TabId[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setError("");
              }}
              className="px-4 py-2 text-sm font-medium transition-colors capitalize"
              style={{
                color: activeTab === tab ? "var(--accent-color, #3b82f6)" : "var(--text-secondary)",
                borderBottom: activeTab === tab ? "2px solid var(--accent-color, #3b82f6)" : "2px solid transparent",
              }}
            >
              {tab === "market" ? "Discover" : `Installed (${installedPlugins.length})`}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div
            className="mx-5 mt-3 p-2 rounded text-xs"
            style={{ backgroundColor: "#ef444410", color: "#ef4444", border: "1px solid #ef444430" }}
          >
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "market" && (
            <>
              {/* Search */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search plugins..."
                className="w-full px-3 py-2 mb-3 rounded border text-sm"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />

              {/* Plugin list */}
              <div className="space-y-2">
                {filteredMarketPlugins.map((plugin) => {
                  const installed = isInstalled(plugin.name);
                  return (
                    <div
                      key={plugin.name}
                      className="p-3 rounded-lg border transition-colors"
                      style={{
                        borderColor: "var(--border-color)",
                        backgroundColor: installed ? "var(--bg-hover)" : "var(--bg-secondary)",
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-sm">{plugin.name}</h3>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                              style={{
                                backgroundColor: "var(--bg-hover)",
                                color: "var(--text-muted)",
                              }}
                            >
                              v{plugin.version}
                            </span>
                            {installed && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: "#22c55e20",
                                  color: "#22c55e",
                                }}
                              >
                                Installed
                              </span>
                            )}
                          </div>
                          <p
                            className="text-xs mt-1 line-clamp-2"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {plugin.description}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span
                              className="text-[10px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              by {plugin.author}
                            </span>
                            <span
                              className="text-[10px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              ★ {plugin.rating}
                            </span>
                            <span
                              className="text-[10px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {plugin.downloads} downloads
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleInstall(plugin.name)}
                          disabled={loading || installed}
                          className="ml-3 px-3 py-1.5 rounded text-xs font-medium shrink-0 transition-colors disabled:opacity-50"
                          style={{
                            backgroundColor: installed ? "var(--bg-hover)" : "var(--accent-color, #3b82f6)",
                            color: installed ? "var(--text-muted)" : "#fff",
                            border: installed ? "1px solid var(--border-color)" : "none",
                          }}
                        >
                          {installed ? "✓" : loading ? "..." : "Install"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === "installed" && (
            <div className="space-y-2">
              {installedPlugins.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
                  No plugins installed. Browse the marketplace to discover plugins.
                </p>
              ) : (
                installedPlugins.map((plugin) => (
                  <div
                    key={plugin.id}
                    className="p-3 rounded-lg border"
                    style={{
                      borderColor: "var(--border-color)",
                      backgroundColor: "var(--bg-secondary)",
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm">{plugin.name}</h3>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                            style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-muted)" }}
                          >
                            v{plugin.version}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor:
                                plugin.status === "loaded" ? "#22c55e20" :
                                plugin.status === "error" ? "#ef444420" : "var(--bg-hover)",
                              color:
                                plugin.status === "loaded" ? "#22c55e" :
                                plugin.status === "error" ? "#ef4444" : "var(--text-muted)",
                            }}
                          >
                            {plugin.status}
                          </span>
                        </div>
                        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                          {plugin.description}
                        </p>
                        <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                          by {plugin.author}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <button
                          onClick={() => handleToggle(plugin.id, plugin.status)}
                          disabled={loading}
                          className="px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50"
                          style={{
                            backgroundColor: plugin.status === "loaded" ? "#ef444420" : "#22c55e20",
                            color: plugin.status === "loaded" ? "#ef4444" : "#22c55e",
                          }}
                        >
                          {plugin.status === "loaded" ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => handleUninstall(plugin.id)}
                          disabled={loading}
                          className="px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50"
                          style={{
                            backgroundColor: "#ef444410",
                            color: "#ef4444",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}