/**
 * Aplica schema no Supabase (produção).
 * Requer DATABASE_URL no .env ou ambiente.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrate.mjs');
const result = spawnSync(process.execPath, [script], {
  env: { ...process.env, STORAGE_BACKEND: 'supabase' },
  stdio: 'inherit',
  windowsHide: false,
});

process.exit(result.status ?? 1);
