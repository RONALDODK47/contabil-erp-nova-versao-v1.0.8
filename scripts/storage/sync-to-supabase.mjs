/**
 * Sincroniza dados do Docker local → Supabase (produção).
 * Uso: npm run storage:push-supabase
 *
 * Env local (.env):
 *   DATABASE_URL          — Postgres Docker (origem)
 *   MINIO_*               — MinIO local (PDFs)
 *
 * Env Supabase (adicione no .env):
 *   SUPABASE_DATABASE_URL — connection string pooler (6543)
 *   SUPABASE_S3_ENDPOINT  — https://[ref].supabase.co/storage/v1/s3
 *   SUPABASE_S3_ACCESS_KEY / SUPABASE_S3_SECRET_KEY
 *   SUPABASE_S3_BUCKET    — eye-vision
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import '../load-env.mjs';
import { getObjectBuffer, isMinioEnabled } from './minio-client.mjs';
import { isLocalDockerBackend } from './runtime-env.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveSupabaseDatabaseUrl() {
  return String(
    process.env.SUPABASE_DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.TARGET_DATABASE_URL ||
      '',
  ).trim();
}

function resolveSupabaseS3Config() {
  const endpoint = String(
    process.env.SUPABASE_S3_ENDPOINT ||
      process.env.SUPABASE_MINIO_S3_ENDPOINT ||
      process.env.MINIO_S3_ENDPOINT ||
      '',
  )
    .trim()
    .replace(/\/$/, '');
  const accessKey = String(
    process.env.SUPABASE_S3_ACCESS_KEY ||
      process.env.SUPABASE_MINIO_ACCESS_KEY ||
      process.env.MINIO_ACCESS_KEY ||
      '',
  ).trim();
  const secretKey = String(
    process.env.SUPABASE_S3_SECRET_KEY ||
      process.env.SUPABASE_MINIO_SECRET_KEY ||
      process.env.MINIO_SECRET_KEY ||
      '',
  ).trim();
  const bucket = String(
    process.env.SUPABASE_S3_BUCKET || process.env.SUPABASE_MINIO_BUCKET || 'eye-vision',
  ).trim();
  const region = String(process.env.SUPABASE_S3_REGION || 'us-east-1').trim();
  return { endpoint, accessKey, secretKey, bucket, region };
}

/** @type {S3Client | null} */
let supabaseS3 = null;

function getSupabaseS3() {
  const cfg = resolveSupabaseS3Config();
  if (!cfg.endpoint || !cfg.accessKey || !cfg.secretKey) return null;
  if (!supabaseS3) {
    supabaseS3 = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
    });
  }
  return supabaseS3;
}

function poolConfig(url) {
  return {
    connectionString: url,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 20_000,
    ssl: url.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  };
}

async function applySchema(remotePool, log) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  log('[storage:push] Aplicando schema no Supabase…');
  await remotePool.query(sql);
  log('[storage:push] Schema OK no Supabase.');
}

async function remoteObjectExists(objectKey) {
  const s3 = getSupabaseS3();
  const bucket = resolveSupabaseS3Config().bucket;
  if (!s3 || !objectKey) return false;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    return true;
  } catch {
    return false;
  }
}

async function copyPdfToSupabase(objectKey, log) {
  if (!objectKey || !isMinioEnabled()) return false;
  const s3 = getSupabaseS3();
  const bucket = resolveSupabaseS3Config().bucket;
  if (!s3) return false;

  if (await remoteObjectExists(objectKey)) {
    return true;
  }

  const buf = await getObjectBuffer(objectKey);
  if (!buf) {
    log(`[storage:push] PDF ausente no MinIO local: ${objectKey}`);
    return false;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: buf,
      ContentType: 'application/pdf',
    }),
  );
  log(`[storage:push] PDF enviado: ${objectKey}`);
  return true;
}

/**
 * @param {import('pg').Pool} localPool
 * @param {import('pg').Pool} remotePool
 * @param {string} officeToken
 * @param {(msg: string) => void} log
 */
async function syncOneOfficeToSupabase(localPool, remotePool, officeToken, log) {
  const token = String(officeToken || '').trim();
  if (!token) return false;

  const officeRes = await localPool.query(`SELECT * FROM offices WHERE office_token = $1`, [token]);
  const officeRow = officeRes.rows[0];
  if (!officeRow) {
    log(`[storage:push] Escritório ${token.slice(0, 8)}… não encontrado no Docker.`);
    return false;
  }

  await remotePool.query(
    `INSERT INTO offices (
       office_token, name, companies_registry, selected_company,
       pricing_companies_registry, pricing_selected_company,
       simulador_contracts, simulador_parcelamentos, simulador_aplicacoes, simulador_precificacao,
       extra_storage, updated_at, updated_by
     ) VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13)
     ON CONFLICT (office_token) DO UPDATE SET
       name = EXCLUDED.name,
       companies_registry = EXCLUDED.companies_registry,
       selected_company = EXCLUDED.selected_company,
       pricing_companies_registry = EXCLUDED.pricing_companies_registry,
       pricing_selected_company = EXCLUDED.pricing_selected_company,
       simulador_contracts = EXCLUDED.simulador_contracts,
       simulador_parcelamentos = EXCLUDED.simulador_parcelamentos,
       simulador_aplicacoes = EXCLUDED.simulador_aplicacoes,
       simulador_precificacao = EXCLUDED.simulador_precificacao,
       extra_storage = EXCLUDED.extra_storage,
       updated_at = EXCLUDED.updated_at,
       updated_by = EXCLUDED.updated_by`,
    [
      officeRow.office_token,
      officeRow.name || '',
      JSON.stringify(officeRow.companies_registry || []),
      officeRow.selected_company || '',
      JSON.stringify(officeRow.pricing_companies_registry || []),
      officeRow.pricing_selected_company || '',
      JSON.stringify(officeRow.simulador_contracts || []),
      JSON.stringify(officeRow.simulador_parcelamentos || []),
      JSON.stringify(officeRow.simulador_aplicacoes || []),
      JSON.stringify(officeRow.simulador_precificacao || []),
      JSON.stringify(officeRow.extra_storage || {}),
      officeRow.updated_at || new Date(),
      String(officeRow.updated_by || 'docker-push'),
    ],
  );

  const tokensRes = await localPool.query(`SELECT token, label, active FROM access_tokens WHERE token = $1`, [
    token,
  ]);
  for (const t of tokensRes.rows) {
    await remotePool.query(
      `INSERT INTO access_tokens (token, label, active)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET label = EXCLUDED.label, active = EXCLUDED.active`,
      [t.token, t.label || t.token, t.active !== false],
    );
  }

  const managersRes = await localPool.query(
    `SELECT office_token, company_slug, company_name, suffix, data, updated_at
     FROM company_manager_data WHERE office_token = $1`,
    [token],
  );

  for (const row of managersRes.rows) {
    await remotePool.query(
      `INSERT INTO company_manager_data
         (office_token, company_slug, company_name, suffix, data, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       ON CONFLICT (office_token, company_slug, suffix) DO UPDATE SET
         company_name = EXCLUDED.company_name,
         data = EXCLUDED.data,
         updated_at = EXCLUDED.updated_at`,
      [
        row.office_token,
        row.company_slug,
        row.company_name || '',
        row.suffix,
        JSON.stringify(row.data || []),
        row.updated_at || new Date(),
      ],
    );
  }

  const pastasRes = await localPool.query(
    `SELECT * FROM extrato_pastas WHERE office_token = $1 ORDER BY created_at`,
    [token],
  );

  let pdfCopied = 0;
  for (const row of pastasRes.rows) {
    if (row.pdf_object_key && getSupabaseS3()) {
      const copied = await copyPdfToSupabase(String(row.pdf_object_key), log);
      if (copied) pdfCopied += 1;
    }

    await remotePool.query(
      `INSERT INTO extrato_pastas (
         id, office_token, company_slug, conta_banco, banco_nome, label,
         saldo_anterior, total, conciliadas, pendentes, rows,
         pdf_object_key, pdf_filename, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         company_slug = EXCLUDED.company_slug,
         conta_banco = EXCLUDED.conta_banco,
         banco_nome = EXCLUDED.banco_nome,
         label = EXCLUDED.label,
         saldo_anterior = EXCLUDED.saldo_anterior,
         total = EXCLUDED.total,
         conciliadas = EXCLUDED.conciliadas,
         pendentes = EXCLUDED.pendentes,
         rows = EXCLUDED.rows,
         pdf_object_key = EXCLUDED.pdf_object_key,
         pdf_filename = EXCLUDED.pdf_filename,
         created_at = EXCLUDED.created_at`,
      [
        row.id,
        row.office_token,
        row.company_slug,
        row.conta_banco || '',
        row.banco_nome || '',
        row.label || 'Extrato',
        row.saldo_anterior || 0,
        row.total || 0,
        row.conciliadas || 0,
        row.pendentes || 0,
        JSON.stringify(row.rows || []),
        row.pdf_object_key || null,
        row.pdf_filename || null,
        row.created_at || new Date(),
      ],
    );
  }

  log(
    `[storage:push] ${token.slice(0, 8)}… — office + ${managersRes.rowCount ?? 0} manager + ${pastasRes.rowCount ?? 0} pastas (${pdfCopied} PDFs).`,
  );
  return true;
}

/**
 * @param {{ log?: (msg: string) => void, officeToken?: string, applySchema?: boolean }} [options]
 */
export async function syncToSupabase(options = {}) {
  const log = options.log ?? ((msg) => console.info(msg));

  if (!isLocalDockerBackend()) {
    log('[storage:push] Defina STORAGE_BACKEND=docker no .env para enviar do Docker local.');
    return { ok: false, error: 'not_docker_backend' };
  }

  const localUrl = String(process.env.DATABASE_URL || '').trim();
  if (!localUrl) {
    log('[storage:push] DATABASE_URL local ausente — suba o Docker (npm run storage:up).');
    return { ok: false, error: 'no_local_database_url' };
  }

  const remoteUrl = resolveSupabaseDatabaseUrl();
  if (!remoteUrl) {
    log('[storage:push] SUPABASE_DATABASE_URL ausente — adicione no .env a connection string do Supabase.');
    return { ok: false, error: 'no_supabase_url' };
  }

  const s3Cfg = resolveSupabaseS3Config();
  if (!s3Cfg.endpoint || !s3Cfg.accessKey) {
    log('[storage:push] Credenciais S3 do Supabase ausentes — metadados serão enviados; PDFs ficam só no Docker.');
  }

  const officeFilter = String(
    options.officeToken || process.env.SUPABASE_SYNC_OFFICE_TOKEN || process.env.VITE_DEV_OFFICE_TOKEN || '',
  ).trim();

  /** @type {import('pg').Pool} */
  const localPool = new Pool(poolConfig(localUrl));
  /** @type {import('pg').Pool} */
  const remotePool = new Pool(poolConfig(remoteUrl));

  let synced = 0;
  try {
    if (options.applySchema !== false) {
      await applySchema(remotePool, log);
    }

    let tokens = [];
    if (officeFilter) {
      tokens = [officeFilter];
    } else {
      const listed = await localPool.query(
        `SELECT office_token FROM offices ORDER BY updated_at DESC NULLS LAST`,
      );
      tokens = listed.rows.map((r) => String(r.office_token || '').trim()).filter(Boolean);
    }

    if (tokens.length === 0) {
      log('[storage:push] Nenhum escritório no Docker para enviar.');
      return { ok: true, synced: 0 };
    }

    log(`[storage:push] Enviando ${tokens.length} escritório(s) Docker → Supabase…`);

    for (const token of tokens) {
      const ok = await syncOneOfficeToSupabase(localPool, remotePool, token, log);
      if (ok) synced += 1;
    }

    log(`[storage:push] Concluído — ${synced} escritório(s) no Supabase.`);
    log('[storage:push] Confirme DATABASE_URL no Render = mesma URI do Supabase.');
    return { ok: true, synced };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[storage:push] Falha: ${msg}`);
    return { ok: false, error: msg };
  } finally {
    await localPool.end().catch(() => {});
    await remotePool.end().catch(() => {});
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = await syncToSupabase();
  process.exit(result.ok ? 0 : 1);
}
