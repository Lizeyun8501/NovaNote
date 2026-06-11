import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SyncStatus } from "./SyncStatus";

interface SyncSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onPasswordSetup: () => void;
}

interface SyncStatusData {
  enabled: boolean;
  server_url: string;
  vault_id: string;
  connected: boolean;
  encryption_ready: boolean;
  master_password_set: boolean;
  offline_queue_size: number;
  last_sync: number;
}

export function SyncSettings({ isOpen, onClose, onPasswordSetup }: SyncSettingsProps) {
  const [serverUrl, setServerUrl] = useState("");
  const [vaultId, setVaultId] = useState("");
  const [status, setStatus] = useState<SyncStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  
  const loadStatus = async () => {
    try {
      const s = await invoke<SyncStatusData>("sync_get_status");
      setStatus(s);
      setServerUrl(s.server_url || "");
      setVaultId(s.vault_id || "");
    } catch (e) {
      // No vault open or sync not initialized
    }
  };
  
  useEffect(() => {
    if (isOpen) loadStatus();
  }, [isOpen]);
  
  const handleConfigure = async () => {
    setLoading(true);
    setMsg("");
    try {
      await invoke("sync_configure", { serverUrl, vaultId });
      setMsg("Configuration saved");
      await loadStatus();
    } catch (e) {
      setMsg("Error: " + String(e));
    }
    setLoading(false);
  };
  
  const handleToggle = async () => {
    try {
      if (status?.enabled) {
        await invoke("sync_disable");
      } else {
        await invoke("sync_enable");
      }
      await loadStatus();
    } catch (e) {
      setMsg("Error: " + String(e));
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="p-6 rounded-lg shadow-xl" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', maxWidth: '480px', width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Sync Settings</h2>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>✕</button>
        </div>
        
        <SyncStatus />
        
        {msg && (
          <div className="mb-3 p-2 rounded text-sm" style={{ background: msg.startsWith('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: msg.startsWith('Error') ? '#ef4444' : '#22c55e' }}>
            {msg}
          </div>
        )}
        
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Server URL</label>
            <input
              type="text"
              value={serverUrl}
              onChange={e => setServerUrl(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              placeholder="http://localhost:3000"
            />
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Vault ID</label>
            <input
              type="text"
              value={vaultId}
              onChange={e => setVaultId(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              placeholder="my-vault"
            />
          </div>
          
          {status && (
            <div className="space-y-2 mt-3 p-3 rounded" style={{ background: 'var(--bg-secondary)' }}>
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>Encryption</span>
                <span style={{ color: status.encryption_ready ? '#22c55e' : '#ef4444' }}>
                  {status.encryption_ready ? 'Ready' : 'Not set'}
                </span>
              </div>
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>Offline Queue</span>
                <span>{status.offline_queue_size} pending</span>
              </div>
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>Last Sync</span>
                <span>{status.last_sync > 0 ? new Date(status.last_sync * 1000).toLocaleString() : 'Never'}</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex gap-2 mt-4">
          <button 
            onClick={handleConfigure}
            disabled={loading}
            className="px-4 py-2 rounded text-sm flex-1"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
          >
            Save Config
          </button>
          {status && (
            <button 
              onClick={handleToggle}
              className="px-4 py-2 rounded text-sm"
              style={{ background: status.enabled ? '#ef4444' : 'var(--accent)', color: '#fff' }}
            >
              {status.enabled ? 'Disable' : 'Enable'}
            </button>
          )}
        </div>
        
        {status && !status.master_password_set && (
          <button 
            onClick={onPasswordSetup}
            className="w-full mt-2 px-4 py-2 rounded text-sm"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Set Master Password
          </button>
        )}
      </div>
    </div>
  );
}