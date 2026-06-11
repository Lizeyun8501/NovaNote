// Unified API layer for all Tauri backend commands.
// All invoke() calls should go through this module to enable:
// - Unified error handling / retry / loading state
// - Mocking in tests
// - Single source of truth for Tauri command names

export { refreshVaultData, readNoteContent, writeNoteContent } from "./vault";
export type { VaultData } from "./vault";