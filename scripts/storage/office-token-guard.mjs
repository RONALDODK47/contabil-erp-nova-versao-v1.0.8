/**
 * Valida office_token contra access_tokens (produção exige token ativo).
 * Em dev local, provisiona automaticamente offices/access_tokens desconhecidos.
 */
import { pgQuery } from './pg-client.mjs';
import { isProductionRuntime } from './runtime-env.mjs';
import { ensureOfficeRow } from './workspace-repo.mjs';

const cache = new Map();
const CACHE_MS = 30_000;

function cacheResult(token, ok, now = Date.now()) {
  cache.set(token, { ok, at: now });
  return ok;
}

async function reactivateAccessToken(token) {
  await pgQuery('UPDATE access_tokens SET active = TRUE WHERE token = $1', [token]);
}

export async function isOfficeTokenAllowed(officeToken) {
  const token = String(officeToken || '').trim();
  if (!token || token.length < 4 || token.length > 256) return false;

  const now = Date.now();
  const hit = cache.get(token);
  if (hit && now - hit.at < CACHE_MS) return hit.ok;

  try {
    const reg = await pgQuery('SELECT active FROM access_tokens WHERE token = $1 LIMIT 1', [token]);
    if (reg.rows[0]) {
      if (reg.rows[0].active !== false) {
        return cacheResult(token, true, now);
      }
      if (isProductionRuntime()) {
        return cacheResult(token, false, now);
      }
      await reactivateAccessToken(token);
      return cacheResult(token, true, now);
    }

    if (isProductionRuntime()) {
      return cacheResult(token, false, now);
    }

    const office = await pgQuery('SELECT 1 FROM offices WHERE office_token = $1 LIMIT 1', [token]);
    if (office.rows.length > 0) {
      return cacheResult(token, true, now);
    }

    await ensureOfficeRow(token, 'dev-auto-provision');
    return cacheResult(token, true, now);
  } catch {
    return false;
  }
}

export function clearOfficeTokenCache() {
  cache.clear();
}
