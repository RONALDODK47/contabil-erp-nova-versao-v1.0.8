/** Debounce único — grava no backend remoto (Docker local ou Supabase na nuvem). */
import { setOperationalSavePhase } from '../../lib/operationalSaveStatus';

export const OPERATIONAL_SAVE_DEBOUNCE_MS = 2500;

let operationalDirtyGeneration = 0;
let lastCloudFlushGeneration = 0;

export function markOperationalStorageDirty(): void {
  operationalDirtyGeneration += 1;
}

export function hasOperationalStorageDirty(): boolean {
  return operationalDirtyGeneration > lastCloudFlushGeneration;
}

/** @deprecated use hasOperationalStorageDirty */
export function hasOperationalCloudDirty(): boolean {
  return hasOperationalStorageDirty();
}

export function markOperationalCloudFlushed(): void {
  lastCloudFlushGeneration = operationalDirtyGeneration;
}

/** @deprecated pasta local removida */
export function markOperationalFolderFlushed(): void {
  markOperationalCloudFlushed();
}

/** @deprecated pasta local removida */
export function hasOperationalFolderDirty(): boolean {
  return hasOperationalStorageDirty();
}

export function scheduleEyeVisionOperationalSave(
  delayMs = OPERATIONAL_SAVE_DEBOUNCE_MS,
): void {
  setOperationalSavePhase('scheduled');
  void import('./eyeVisionCloudPush').then(({ scheduleEyeVisionCloudPush }) => {
    scheduleEyeVisionCloudPush();
  });
  void delayMs;
}

/** Grava memória pendente → API → Docker ou Supabase. */
export async function flushEyeVisionOperationalSave(options?: {
  force?: boolean;
  light?: boolean;
}): Promise<void> {
  const [{ flushManagerDataWrites }, pushMod, syncMod] = await Promise.all([
    import('./companyWorkspace'),
    import('./eyeVisionCloudPush'),
    import('./eyeVisionCloudSync'),
  ]);

  flushManagerDataWrites();

  if (!syncMod.isEyeVisionCloudPushPaused()) {
    setOperationalSavePhase('saving');
    try {
      await pushMod.flushEyeVisionCloudPushSafe({ force: options?.force ?? true });
      setOperationalSavePhase('saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar';
      setOperationalSavePhase('error', msg);
      throw err;
    }
  } else {
    setOperationalSavePhase('saved');
  }
}
