/**
 * Sincroniza dados do Supabase (deploy) → Docker local (desenvolvimento).
 * Produção (STORAGE_BACKEND=supabase) ignora este script.
 *
 * Uso: npm run storage:sync-supabase
 * Env: SUPABASE_DATABASE_URL + credenciais S3 do Supabase Storage (opcional para PDFs).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import '../load-env.mjs';
import * as repo from './workspace-repo.mjs';
import { isMinioEnabled, putObject } from './minio-client.mjs';
import { closePgPool } from './pg-client.mjs';
import { isLocalDockerBackend } from './runtime-env.mjs';

const { Pool } = pg;

function resolveSupabaseDatabaseUrl() {
  return String(
    process.env.SUPABASE_DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.SUPABASE_URL_DATABASE ||
      '',
  ).trim();
}

function resolveSupabaseS3Config() {
  const endpoint = String(
    process.env.SUPABASE_S3_ENDPOINT ||
      process.env.SUPABASE_MINIO_S3_ENDPOINT ||
      process.env.SUPABASE_STORAGE_S3_ENDPOINT ||
      '',
  )
    .trim()
    .replace(/\/$/, '');
  const accessKey = String(
    process.env.SUPABASE_S3_ACCESS_KEY ||
      process.env.SUPABASE_MINIO_ACCESS_KEY ||
      process.env.SUPABASE_STORAGE_ACCESS_KEY ||
      '',
  ).trim();
  const secretKey = String(
    process.env.SUPABASE_S3_SECRET_KEY ||
      process.env.SUPABASE_MINIO_SECRET_KEY ||
      process.env.SUPABASE_STORAGE_SECRET_KEY ||
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

async function fetchRemoteObjectBuffer(objectKey) {
  const s3 = getSupabaseS3();
  const bucket = resolveSupabaseS3Config().bucket;
  if (!s3 || !objectKey) return null;
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
    const chunks = [];
    for await (const chunk of out.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

async function copyPdfToLocalMinio(objectKey, log) {
  if (!objectKey || !isMinioEnabled()) return false;
  const buf = await fetchRemoteObjectBuffer(objectKey);
  if (!buf) return false;
  await putObject(objectKey, buf, 'application/pdf');
  log(`[storage:sync] PDF copiado: ${objectKey}`);
  return true;
}

function mapManagerRows(rows) {
  /** @type {Map<string, { company_slug: string, company_name: string, data: Record<string, unknown[]> }>} */
  const bySlug = new Map();
  for (const row of rows) {
    const slug = String(row.company_slug || '').trim();
    if (!slug) continue;
    let cur = bySlug.get(slug);
    if (!cur) {
      cur = {
        company_slug: slug,
        company_name: String(row.company_name || ''),
        data: {},
      };
      bySlug.set(slug, cur);
    }
    const suffix = String(row.suffix || '').trim();
    if (suffix) {
      cur.data[suffix] = Array.isArray(row.data) ? row.data : [];
    }
    if (row.company_name) cur.company_name = String(row.company_name);
  }
  return [...bySlug.values()];
}

function mapExtratoPastaRow(row) {
  return {
    id: String(row.id),
    companySlug: String(row.company_slug || ''),
    contaBanco: String(row.conta_banco || ''),
    bancoNome: String(row.banco_nome || ''),
    label: String(row.label || 'Extrato'),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    saldoAnterior: Number(row.saldo_anterior) || 0,
    total: Number(row.total) || 0,
    conciliadas: Number(row.conciliadas) || 0,
    pendentes: Number(row.pendentes) || 0,
    rows: Array.isArray(row.rows) ? row.rows : [],
    pdfObjectKey: row.pdf_object_key || undefined,
    pdfFilename: row.pdf_filename || undefined,
  };
}

/**
 * @param {import('pg').Pool} remotePool
 * @param {string} officeToken
 * @param {(msg: string) => void} log
 */
async function syncOneOffice(remotePool, officeToken, log) {
  const token = String(officeToken || '').trim();
  if (!token) return false;

  const officeRes = await remotePool.query(`SELECT * FROM offices WHERE office_token = $1`, [token]);
  const officeRow = officeRes.rows[0];
  if (!officeRow) {
    log(`[storage:sync] Escritório ${token.slice(0, 8)}… não encontrado no Supabase.`);
    return false;
  }

  const officePayload = {
    name: officeRow.name || '',
    companies_registry: officeRow.companies_registry || [],
    selected_company: officeRow.selected_company || '',
    pricing_companies_registry: officeRow.pricing_companies_registry || [],
    pricing_selected_company: officeRow.pricing_selected_company || '',
    simulador_contracts: officeRow.simulador_contracts || [],
    simulador_parcelamentos: officeRow.simulador_parcelamentos || [],
    simulador_aplicacoes: officeRow.simulador_aplicacoes || [],
    simulador_precificacao: officeRow.simulador_precificacao || [],
    extra_storage: officeRow.extra_storage || {},
  };

  await repo.setOffice(token, officePayload, String(officeRow.updated_by || 'supabase-sync'));

  const tokensRes = await remotePool.query(
    `SELECT token, label, active FROM access_tokens WHERE token = $1`,
    [token],
  );
  for (const t of tokensRes.rows) {
    await repo.ensureOfficeRow(token);
  }

  const managersRes = await remotePool.query(
    `SELECT office_token, company_slug, company_name, suffix, data, updated_at
     FROM company_manager_data WHERE office_token = $1`,
    [token],
  );
  for (const manager of mapManagerRows(managersRes.rows)) {
    await repo.setManager(token, manager.company_slug, manager, 'supabase-sync');
  }

  const pastasRes = await remotePool.query(
    `SELECT * FROM extrato_pastas WHERE office_token = $1 ORDER BY created_at`,
    [token],
  );

  let pdfCopied = 0;
  for (const row of pastasRes.rows) {
    const pasta = mapExtratoPastaRow(row);
    const slug = pasta.companySlug;
    if (!slug) continue;

    if (pasta.pdfObjectKey && getSupabaseS3()) {
      const exists = await remoteObjectExists(pasta.pdfObjectKey);
      if (exists) {
        const copied = await copyPdfToLocalMinio(pasta.pdfObjectKey, log);
        if (copied) pdfCopied += 1;
      }
    }

    await repo.saveExtratoPasta(token, slug, {
      ...pasta,
      pdfBase64: undefined,
    });
  }

  log(
    `[storage:sync] Escritório ${token.slice(0, 8)}… — office + ${managersRes.rowCount ?? 0} linhas manager + ${pastasRes.rowCount ?? 0} pastas (${pdfCopied} PDFs).`,
  );
  return true;
}

/**
 * @param {{ log?: (msg: string) => void, officeToken?: string, skipIfLocalNewer?: boolean }} [options]
 */
export async function syncFromSupabase(options = {}) {
  const log = options.log ?? ((msg) => console.info(msg));

  if (!isLocalDockerBackend()) {
    log('[storage:sync] STORAGE_BACKEND=supabase (produção) — sync Supabase→Docker ignorado.');
    return { ok: true, skipped: true, reason: 'production_backend' };
  }

  const remoteUrl = resolveSupabaseDatabaseUrl();
  if (!remoteUrl) {
    log('[storage:sync] SUPABASE_DATABASE_URL ausente — configure no .env para puxar dados da nuvem.');
    return { ok: true, skipped: true, reason: 'no_supabase_url' };
  }

  if (!String(process.env.DATABASE_URL || '').trim()) {
    log('[storage:sync] DATABASE_URL local ausente — suba o Docker primeiro.');
    return { ok: false, error: 'no_local_database_url' };
  }

  const s3Cfg = resolveSupabaseS3Config();
  if (!s3Cfg.endpoint || !s3Cfg.accessKey) {
    log('[storage:sync] Credenciais S3 do Supabase ausentes — metadados serão copiados; PDFs podem ficar só na nuvem.');
  }

  const officeFilter = String(
    options.officeToken || process.env.SUPABASE_SYNC_OFFICE_TOKEN || '',
  ).trim();

  /** @type {import('pg').Pool} */
  const remotePool = new Pool({
    connectionString: remoteUrl,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    ssl: remoteUrl.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  });

  let synced = 0;
  try {
    let tokens = [];
    if (officeFilter) {
      tokens = [officeFilter];
    } else {
      const listed = await remotePool.query(
        `SELECT office_token FROM offices ORDER BY updated_at DESC NULLS LAST`,
      );
      tokens = listed.rows.map((r) => String(r.office_token || '').trim()).filter(Boolean);
    }

    if (tokens.length === 0) {
      log('[storage:sync] Nenhum escritório no Supabase para sincronizar.');
      return { ok: true, synced: 0 };
    }

    log(`[storage:sync] Puxando ${tokens.length} escritório(s) do Supabase → Docker local…`);

    for (const token of tokens) {
      const ok = await syncOneOffice(remotePool, token, log);
      if (ok) synced += 1;
    }

    log(`[storage:sync] Concluído — ${synced} escritório(s) no Docker local.`);
    return { ok: true, synced };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[storage:sync] Falha: ${msg}`);
    return { ok: false, error: msg };
  } finally {
    await remotePool.end().catch(() => {});
    await closePgPool().catch(() => {});
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = await syncFromSupabase();
  process.exit(result.ok ? 0 : 1);
}
