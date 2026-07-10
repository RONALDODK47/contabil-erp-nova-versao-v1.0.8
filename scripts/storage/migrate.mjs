/**
 * Aplica schema SQL multi-tenant (office_token).
 * Uso: npm run storage:migrate
 */
import '../load-env.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { closePgPool, getDatabaseUrl, isPostgresStorageEnabled, pgQuery } from './pg-client.mjs';
import { ensureMinioBucket, isMinioEnabled } from './minio-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!isPostgresStorageEnabled()) {
    console.error('[storage:migrate] Defina STORAGE_BACKEND=postgres|docker|supabase no .env');
    process.exit(1);
  }
  if (!getDatabaseUrl()) {
    console.error('[storage:migrate] Defina DATABASE_URL no .env');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.info('[storage:migrate] Aplicando schema…');
  await pgQuery(sql);
  console.info('[storage:migrate] Schema OK');

  if (isMinioEnabled()) {
    await ensureMinioBucket();
    console.info('[storage:migrate] Bucket de objetos OK (MinIO ou Supabase Storage)');
  } else if (String(process.env.STORAGE_BACKEND || '').toLowerCase() === 'supabase') {
    console.warn(
      '[storage:migrate] Supabase sem MINIO_S3_ENDPOINT — PDFs de extrato não serão persistidos. Veja .env.production.example',
    );
  } else {
    console.warn('[storage:migrate] Storage de blobs não configurado — só metadados no Postgres.');
  }

  await closePgPool();
}

main().catch(async (err) => {
  console.error('[storage:migrate] Falha:', err?.message || err);
  try {
    await closePgPool();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
