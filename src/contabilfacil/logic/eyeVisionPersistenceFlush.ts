import { flushManagerDataWrites } from './companyWorkspace';
import {
  flushEyeVisionOperationalSave,
  scheduleEyeVisionOperationalSave,
} from './eyeVisionOperationalSave';

/** Grava memória pendente + pasta (arquivo versionado) + Docker. */
export async function flushAllEyeVisionPersistence(): Promise<void> {
  await flushEyeVisionOperationalSave({ force: true, light: true });
}

/**
 * Após salvar/importar — grava memória imediatamente e agenda pasta/Docker em idle.
 * Evita freeze: não força backup completo síncrono na main thread.
 */
export async function flushPersistenceAfterCriticalWrite(): Promise<void> {
  flushManagerDataWrites();
  scheduleEyeVisionOperationalSave(1200);
}

const PERIODIC_FLUSH_MS = 180_000;

function schedulePersistenceFlush(): void {
  scheduleEyeVisionOperationalSave();
}

/** Tenta flush completo sem bloquear pintura / input do usuário. */
function requestIdleOperationalFlush(force = true): void {
  flushManagerDataWrites();
  const run = () => void flushEyeVisionOperationalSave({ force, light: true });
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: force ? 1500 : 4000 });
  } else {
    setTimeout(run, force ? 50 : 400);
  }
}

/**
 * Garante que digitações/exclusões não se perdem ao trocar aba, minimizar ou fechar o browser.
 * - beforeunload → só memória (rápido)
 * - pagehide / visibility hidden → memória + flush em idle
 * - intervalo periódico enquanto a aba está visível
 */
export function registerEyeVisionAutoSaveLifecycle(): () => void {
  const onBeforeUnload = () => {
    flushManagerDataWrites();
  };

  const onPageHide = () => {
    requestIdleOperationalFlush(true);
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      flushManagerDataWrites();
      scheduleEyeVisionOperationalSave(400);
      requestIdleOperationalFlush(true);
    }
  };

  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibility);

  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible') schedulePersistenceFlush();
  }, PERIODIC_FLUSH_MS);

  return () => {
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(interval);
  };
}
