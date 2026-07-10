/**
 * Dispara migração Firestore → Docker via agent-api (uma vez por navegador).
 */
import { apiMigrateFromFirebase } from '../../gestaoContabil/dbClientPostgres';

const MIGRATED_KEY = 'eye_vision_firebase_migrated_v1';

function readMigratedTokens(): string[] {
  try {
    const raw = localStorage.getItem(MIGRATED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function markTokenMigrated(token: string): void {
  const set = new Set(readMigratedTokens());
  set.add(token);
  localStorage.setItem(MIGRATED_KEY, JSON.stringify([...set]));
}

export async function migrateFromFirebaseIfNeeded(officeToken: string): Promise<boolean> {
  const token = String(officeToken || '').trim();
  if (!token) return false;
  if (readMigratedTokens().includes(token)) return false;

  const result = await apiMigrateFromFirebase(token);
  if (result.skipped && result.reason === 'no_credentials') return false;
  if (result.ok) {
    markTokenMigrated(token);
    return (result.migrated ?? 0) > 0 || !result.skipped;
  }
  return false;
}
