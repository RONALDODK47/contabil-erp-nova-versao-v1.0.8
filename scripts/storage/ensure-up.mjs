/**
 * Garante Postgres/MinIO (Docker) prontos antes do agent-api.
 * Ignora quando STORAGE_BACKEND=supabase (produção cloud).
 *
 * Uso direto: node scripts/storage/ensure-up.mjs
 * Ou import: import { ensureStorageUp } from './storage/ensure-up.mjs'
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import '../load-env.mjs';
import { syncFromSupabase } from './sync-from-supabase.mjs';
import { migrateFromFirebase } from './migrate-from-firebase.mjs';
import { isDevMigrationEnabled, isLocalDockerBackend } from './runtime-env.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CONTAINERS = {
  postgres: 'eye-vision-postgres',
  minio: 'eye-vision-minio',
};

const COMPOSE_CMD = [
  'compose',
  '-f',
  'docker-compose.yml',
  '-f',
  'docker-compose.dev.yml',
  'up',
  '-d',
];

function runQuiet(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function dockerAvailable() {
  const out = runQuiet('docker info');
  return Boolean(out && /Server Version/i.test(out));
}

function containerHealth(name) {
  return runQuiet(`docker inspect ${name} --format "{{.State.Health.Status}}"`);
}

function containersHealthy() {
  return (
    containerHealth(CONTAINERS.postgres) === 'healthy' &&
    containerHealth(CONTAINERS.minio) === 'healthy'
  );
}

async function waitForHealthy(timeoutMs = 120_000, intervalMs = 2_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (containersHealthy()) return true;
    await delay(intervalMs);
  }
  return false;
}

function runCompose() {
  return spawnSync('docker', COMPOSE_CMD, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function runMigrate() {
  const migrateScript = path.join(root, 'scripts', 'storage', 'migrate.mjs');
  return spawnSync(process.execPath, [migrateScript], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: false,
  });
}

function ensureEnvFile(log) {
  const envPath = path.join(root, '.env');
  if (existsSync(envPath)) return;

  const examplePath = path.join(root, '.env.example');
  if (!existsSync(examplePath)) {
    log('[storage] .env ausente — copie .env.example manualmente.');
    return;
  }

  let content = readFileSync(examplePath, 'utf8');
  content = content
    .replace(/ALTERE_ESTA_SENHA_POSTGRES/g, 'eye')
    .replace(/ALTERE_ESTA_SENHA_MINIO/g, 'eyevisionsecret')
    .replace(/MY_GEMINI_API_KEY/g, '');

  writeFileSync(envPath, content, 'utf8');
  log('[storage] .env criado a partir de .env.example (senhas locais padrão).');
  loadDotenv({ path: envPath, quiet: true, override: true });
}

/**
 * @param {{ log?: (msg: string) => void, skipMigrate?: boolean, skipSupabaseSync?: boolean }} [options]
 */
export async function ensureStorageUp(options = {}) {
  const log = options.log ?? ((msg) => console.info(msg));
  const skipMigrate = options.skipMigrate ?? false;
  const skipSupabaseSync = options.skipSupabaseSync ?? false;

  ensureEnvFile(log);

  if (!isLocalDockerBackend()) {
    log('[storage] STORAGE_BACKEND remoto — Docker local ignorado.');
    return { ok: true, skipped: true, reason: 'remote_backend' };
  }

  if (!dockerAvailable()) {
    log(
      '[storage] Docker indisponível — inicie o Docker Desktop e rode npm run storage:up manualmente.',
    );
    return { ok: false, error: 'docker_unavailable' };
  }

  if (!containersHealthy()) {
    log('[storage] Subindo Postgres + MinIO (docker compose)…');
    const compose = runCompose();
    if ((compose.status ?? 1) !== 0) {
      log('[storage] Falha ao subir docker compose — verifique .env (senhas Postgres/MinIO).');
      return { ok: false, error: 'compose_failed' };
    }

    log('[storage] Aguardando Postgres/MinIO ficarem saudáveis…');
    const healthy = await waitForHealthy();
    if (!healthy) {
      const pg = containerHealth(CONTAINERS.postgres) || 'ausente';
      const minio = containerHealth(CONTAINERS.minio) || 'ausente';
      log(`[storage] Timeout — postgres=${pg}, minio=${minio}`);
      return { ok: false, error: 'health_timeout' };
    }
  } else {
    log('[storage] Postgres e MinIO já estão saudáveis.');
  }

  if (!skipMigrate) {
    if (!String(process.env.STORAGE_BACKEND || '').trim()) {
      process.env.STORAGE_BACKEND = 'docker';
    }
    if (!String(process.env.DATABASE_URL || '').trim()) {
      log('[storage] Migrate ignorado — copie .env.example para .env e ajuste as senhas.');
    } else {
      log('[storage] Aplicando schema (migrate)…');
      const migrate = runMigrate();
      if ((migrate.status ?? 1) !== 0) {
        log('[storage] Migrate falhou — schema pode já estar aplicado; continuando.');
      }
    }
  }

  if (!skipSupabaseSync && isDevMigrationEnabled() && isLocalDockerBackend()) {
    const sync = await syncFromSupabase({ log });
    if (!sync.ok && !sync.skipped) {
      log('[storage] Sync Supabase→Docker falhou — dados locais podem estar desatualizados.');
    }
  }

  if (
    isDevMigrationEnabled() &&
    isLocalDockerBackend() &&
    String(process.env.FIREBASE_MIGRATE_ON_START || '').toLowerCase() === 'true'
  ) {
    const fb = await migrateFromFirebase({ skipDockerEnsure: true });
    if (!fb.ok && !fb.skipped) {
      log('[storage] Migração Firebase→Docker falhou — verifique credenciais no .env.');
    }
  }

  return { ok: true };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = await ensureStorageUp();
  process.exit(result.ok ? 0 : 1);
}
