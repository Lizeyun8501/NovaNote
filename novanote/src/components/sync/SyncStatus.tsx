import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SyncState {
  enabled: boolean;
  connected: boolean;
  encryption_ready: boolean;
  master_password_set: boolean;
  offline_queue_size: number;
}

export function SyncStatus() {
  const [status, setStatus] = useState<SyncState | null>(null);
  
  const refreshStatus = async () => {
    try {
      const s = await invoke<SyncState>("sync_get_status");
      setStatus(s);
    } catch (_e) {
      // sync not available
    }
  };
  
  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, []);
  
  if (!status || !status.master_password_set) {
    return (
      <div className="flex items-center gap-1 px-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>🔒</span>
        <span>No sync</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-1 px-2 text-xs" style={{ color: status.connected ? '#22c55e' : 'var(--text-muted)' }}>
      <span>{status.connected ? '🟢' : status.encryption_ready ? '🔵' : '🔴'}</span>
      <span>{status.connected ? 'Connected' : 'Offline'}</span>
      {status.offline_queue_size > 0 && (
        <span style={{ color: '#f59e0b' }}>({status.offline_queue_size})</span>
      )}
    </div>
  );
}