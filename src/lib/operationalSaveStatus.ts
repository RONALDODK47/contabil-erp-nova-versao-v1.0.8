/** Indicador de salvamento e sincronização (Docker local ou Supabase via API). */

export type OperationalSavePhase =
  | 'idle'
  | 'scheduled'
  | 'saving'
  | 'syncing'
  | 'saved'
  | 'offline'
  | 'error';

let phase: OperationalSavePhase = 'idle';
let lastError: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function getOperationalSavePhase(): OperationalSavePhase {
  return phase;
}

export function getOperationalSaveError(): string | null {
  return lastError;
}

export function subscribeOperationalSave(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setOperationalSavePhase(next: OperationalSavePhase, error: string | null = null): void {
  phase = next;
  lastError = error;
  notify();
}
