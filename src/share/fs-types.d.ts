/**
 * The File System Access API surface the agent uses, declared here because
 * TypeScript's DOM lib does not yet carry the experimental parts. Chromium
 * only (SPEC-ACCOUNTS.md §2) — the agent page detects absence and says so.
 */

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
  queryPermission(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker?(options?: { id?: string; mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
}
