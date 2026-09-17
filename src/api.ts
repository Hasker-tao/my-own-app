import type { CollectionName, WorkspaceState, DashboardData, BackupRecord, Entity } from "./types";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new ApiError(result?.error?.message ?? `操作失败（${response.status}）`, response.status);
  }
  if (response.status === 204) return undefined as T;
  const result = await response.json();
  return result.data as T;
}

export const api = {
  state: () => request<WorkspaceState>("/api/state"),
  dashboard: (date: string) => request<DashboardData>(`/api/dashboard?date=${encodeURIComponent(date)}`),
  search: (query: string) => request<Entity[]>(`/api/search?q=${encodeURIComponent(query)}`),
  create: (collection: CollectionName, input: Record<string, any>) =>
    request<Entity>(`/api/collections/${collection}`, { method: "POST", body: JSON.stringify(input) }),
  update: (collection: CollectionName, id: string, input: Record<string, any>) =>
    request<Entity>(`/api/collections/${collection}/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (collection: CollectionName, id: string) =>
    request<Entity>(`/api/collections/${collection}/${id}`, { method: "DELETE" }),
  restore: (collection: CollectionName, id: string) =>
    request<Entity>(`/api/collections/${collection}/${id}/restore`, { method: "POST" }),
  permanentDelete: (collection: CollectionName, id: string) =>
    request<void>(`/api/collections/${collection}/${id}/permanent`, { method: "DELETE" }),
  convertMemo: (id: string, collection: CollectionName, fields: Record<string, any>) =>
    request<Entity>(`/api/quick-memos/${id}/convert`, { method: "POST", body: JSON.stringify({ collection, fields }) }),
  settings: () => request<Record<string, any>>("/api/settings"),
  saveSettings: (input: Record<string, any>) => request<Record<string, any>>("/api/settings", { method: "PUT", body: JSON.stringify(input) }),
  systemStatus: () => request<Record<string, any>>("/api/system/status"),
  saveNow: () => request<{ savedAt: string; database: string; dataFile: string }>("/api/system/save", { method: "POST" }),
  saveAndExit: () => request<{ savedAt: string; database: string; dataFile: string; exiting: boolean }>("/api/system/save-and-exit", { method: "POST" }),
  openDataDirectory: () => request<Record<string, any>>("/api/system/open-data-directory", { method: "POST" }),
  openPath: (path: string) => request<Record<string, any>>("/api/system/open-path", { method: "POST", body: JSON.stringify({ path }) }),
  backups: () => request<BackupRecord[]>("/api/backups"),
  createBackup: (label = "", keep = false) => request<BackupRecord>("/api/backups", { method: "POST", body: JSON.stringify({ label, keep }) }),
  updateBackup: (id: string, input: { label?: string; keep?: boolean }) => request<BackupRecord>(`/api/backups/${id}/metadata`, { method: "PATCH", body: JSON.stringify(input) }),
  restoreBackup: (id: string) => request<{ restored: boolean }>(`/api/backups/${id}/restore`, { method: "POST" }),
  exportAll: () => request<{ filename: string; path: string; size: number; downloadUrl: string }>("/api/export", { method: "POST" }),
};
