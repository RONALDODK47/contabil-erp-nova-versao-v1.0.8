import { SIMULADOR_ALL_MANAGED_STORAGE_KEYS } from '../../lib/simuladorFullBackup';
import {
  attachRawBrowserStorage,
  isOperationalStorageKey,
  isQuotaExceededError,
  purgeOperationalLocalStorage,
  reclaimLocalStorageSpace,
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from '../../lib/safeLocalStorage';

const CONTABILFACIL_PREFIX = 'contabilfacil_';
const MANAGED_PREFIXES = [
  CONTABILFACIL_PREFIX,
  'extratoVision_',
  'eye_vision_',
  'eye-vision_',
  'manager_',
  'simulador_',
] as const;

function isManagedStorageKey(key: string): boolean {
  if ((SIMULADOR_ALL_MANAGED_STORAGE_KEYS as readonly string[]).includes(key)) return true;
  return MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

let storagePatchInstalled = false;

/**
 * Intercepta localStorage: dados operacionais → memória + Docker/Supabase.
 * Nunca gravam no disco do navegador.
 */
export function installBrowserOperationalStorageGuard(): void {
  if (storagePatchInstalled || typeof localStorage === 'undefined') return;
  storagePatchInstalled = true;

  const origGet = localStorage.getItem.bind(localStorage);
  const origSet = localStorage.setItem.bind(localStorage);
  const origRemove = localStorage.removeItem.bind(localStorage);

  attachRawBrowserStorage({
    getItem: origGet,
    setItem: origSet,
    removeItem: origRemove,
  });

  localStorage.getItem = (key: string) => {
    if (isOperationalStorageKey(key)) {
      return safeLocalStorageGetItem(key);
    }
    return origGet(key);
  };

  localStorage.setItem = (key: string, value: string) => {
    if (isOperationalStorageKey(key)) {
      safeLocalStorageSetItem(key, value);
      return;
    }
    try {
      origSet(key, value);
    } catch (err) {
      if (isQuotaExceededError(err)) {
        reclaimLocalStorageSpace([key]);
        try {
          origSet(key, value);
        } catch {
          console.warn(`[storage] cota cheia ao gravar ${key} — mantido em memória + API.`);
          safeLocalStorageSetItem(key, value);
          return;
        }
      } else {
        throw err;
      }
    }
    if (isManagedStorageKey(key)) {
      void import('../logic/eyeVisionOperationalSave').then(
        ({ markOperationalStorageDirty, scheduleEyeVisionOperationalSave }) => {
          markOperationalStorageDirty();
          scheduleEyeVisionOperationalSave();
        },
      );
    }
  };

  localStorage.removeItem = (key: string) => {
    if (isOperationalStorageKey(key)) {
      safeLocalStorageRemoveItem(key);
      return;
    }
    origRemove(key);
    if (isManagedStorageKey(key)) {
      void import('../logic/eyeVisionOperationalSave').then(
        ({ markOperationalStorageDirty, scheduleEyeVisionOperationalSave }) => {
          markOperationalStorageDirty();
          scheduleEyeVisionOperationalSave();
        },
      );
    }
  };

  purgeOperationalLocalStorage();
}

/** Instala guard de memória (sem pasta local). */
export function registerOperationalStorageLifecycle(): () => void {
  installBrowserOperationalStorageGuard();
  return () => {};
}

/** @deprecated use registerOperationalStorageLifecycle */
export function registerLocalFolderDatabaseLifecycle(): () => void {
  return registerOperationalStorageLifecycle();
}
