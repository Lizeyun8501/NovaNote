import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SetupPasswordProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function SetupPassword({ onComplete, onCancel }: SetupPasswordProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async () => {
    setError("");
    
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    
    setLoading(true);
    try {
      await invoke("sync_set_master_password", { password });
      onComplete();
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };
  
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="p-6 rounded-lg shadow-xl" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', maxWidth: '400px', width: '90%' }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Set Up Sync Encryption
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Set a master password to enable end-to-end encrypted sync. This password is never sent to the server.
        </p>
        
        {error && (
          <div className="mb-3 p-2 rounded text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            {error}
          </div>
        )}
        
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Master Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm"
              style={{ 
                background: 'var(--bg-secondary)', 
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)'
              }}
              placeholder="Min 8 characters"
            />
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm"
              style={{ 
                background: 'var(--bg-secondary)', 
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)'
              }}
              placeholder="Re-enter password"
            />
          </div>
        </div>
        
        <div className="flex gap-2 mt-4 justify-end">
          <button 
            onClick={onCancel}
            className="px-4 py-2 rounded text-sm"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 rounded text-sm"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {loading ? 'Setting up...' : 'Set Password'}
          </button>
        </div>
      </div>
    </div>
  );
}