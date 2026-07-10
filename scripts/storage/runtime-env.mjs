/**
 * Ambiente de execução — separa dev local (Docker) de produção (Supabase).
 */
import '../load-env.mjs';

export function isProductionRuntime() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

export function isSupabaseBackend() {
  return String(process.env.STORAGE_BACKEND || '').trim().toLowerCase() === 'supabase';
}

export function isLocalDockerBackend() {
  const backend = String(process.env.STORAGE_BACKEND || 'docker').trim().toLowerCase();
  return backend === 'docker' || backend === 'postgres' || backend === 'postgresql';
}

/** Rotas de import/sync legado — só desenvolvimento local. */
export function isDevMigrationEnabled() {
  if (isProductionRuntime() || isSupabaseBackend()) return false;
  return String(process.env.ALLOW_DEV_MIGRATION_ROUTES || 'true').toLowerCase() !== 'false';
}

export function assertDevMigrationRoute(res) {
  if (isDevMigrationEnabled()) return true;
  res.status(403).json({
    ok: false,
    error: 'Rota disponível apenas em desenvolvimento local (Docker).',
  });
  return false;
}
