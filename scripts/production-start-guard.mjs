/**
 * Validações de segurança ao subir agent-api em produção.
 */
import './load-env.mjs';
import { isProductionRuntime, isSupabaseBackend } from './storage/runtime-env.mjs';

function fail(msg) {
  console.error(`[production:guard] ${msg}`);
  process.exit(1);
}

if (isProductionRuntime()) {
  const cors = String(process.env.CORS_ALLOWED_ORIGIN || '').trim();
  if (!cors || cors === '*') {
    fail(
      'Defina CORS_ALLOWED_ORIGIN com a URL exata do frontend (ex.: https://seu-app.vercel.app). Não use *.',
    );
  }

  if (!isSupabaseBackend()) {
    fail('STORAGE_BACKEND deve ser supabase em produção.');
  }

  for (const forbidden of [
    'FIREBASE_MIGRATE_ON_START',
    'FIREBASE_MIGRATE_EMAIL',
    'FIREBASE_MIGRATE_PASSWORD',
    'LEGACY_EYE_VISION_ROOT',
  ]) {
    if (String(process.env[forbidden] || '').trim()) {
      fail(`${forbidden} não deve existir no ambiente de produção.`);
    }
  }

  if (String(process.env.ALLOW_DEV_MIGRATION_ROUTES || '').toLowerCase() === 'true') {
    fail('ALLOW_DEV_MIGRATION_ROUTES deve ser false ou ausente em produção.');
  }

  if (!String(process.env.DATABASE_URL || '').trim()) {
    fail('DATABASE_URL obrigatória.');
  }

  if (!String(process.env.GEMINI_API_KEY || '').trim()) {
    fail('GEMINI_API_KEY obrigatória no Render (nunca no Vercel).');
  }

  console.info('[production:guard] Ambiente de produção validado.');
}
