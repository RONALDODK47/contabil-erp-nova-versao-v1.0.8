/**
 * Chave seletora de persistência:
 * - docker  → computador local (PostgreSQL + MinIO no Docker)
 * - supabase → deploy na internet (API no Render + Postgres Supabase)
 *
 * Defina VITE_STORAGE_BACKEND ou deixe em auto (localhost → docker, resto → supabase).
 */
export type StorageBackendMode = 'docker' | 'supabase';

export function resolveStorageBackendMode(): StorageBackendMode {
  const flag = String(import.meta.env.VITE_STORAGE_BACKEND || '').trim().toLowerCase();
  if (flag === 'supabase') return 'supabase';
  if (flag === 'docker' || flag === 'postgres' || flag === 'postgresql') return 'docker';
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return 'docker';
  }
  return 'supabase';
}

export function storageBackendLabel(mode: StorageBackendMode = resolveStorageBackendMode()): string {
  return mode === 'docker' ? 'Docker (local)' : 'Supabase (nuvem)';
}

export function storageBackendShortLabel(mode: StorageBackendMode = resolveStorageBackendMode()): string {
  return mode === 'docker' ? 'Docker' : 'Supabase';
}

/** Frontend sempre usa API remota (agent-api local ou Render). */
export function isRemoteWorkspaceStorageEnabled(): boolean {
  const flag = String(import.meta.env.VITE_STORAGE_BACKEND || '').trim().toLowerCase();
  if (flag === 'local' || flag === 'fallback') return false;
  return true;
}
