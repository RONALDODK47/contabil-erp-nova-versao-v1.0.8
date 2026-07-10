/**
 * Migra dados Eye Vision do Firestore (projeto legado) → Docker Postgres/MinIO local.
 *
 * Uso:
 *   npm run storage:migrate-firebase
 *   npm run storage:migrate-firebase -- --force
 *
 * Env (.env):
 *   LEGACY_EYE_VISION_ROOT=C:\...\EMPRESTIMOS-MASTER-master
 *   FIREBASE_MIGRATE_EMAIL=...
 *   FIREBASE_MIGRATE_PASSWORD=...
 *   FIREBASE_SYNC_OFFICE_TOKEN=   (opcional — só um escritório)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, query, where } from 'firebase/firestore';
import '../load-env.mjs';
import { mergeManagerCloudDocuments } from './firebase-manager-shard.mjs';
import * as repo from './workspace-repo.mjs';
import { closePgPool } from './pg-client.mjs';
import { ensureStorageUp } from './ensure-up.mjs';
import { isDevMigrationEnabled } from './runtime-env.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATED_FLAG = path.join(root, '.data', 'firebase-migrated.flag');
const CLOUD_ACCESS_CACHE = path.join(root, '.data', 'firebase-cloud-access-config.json');

const OFFICE_COLLECTION = 'eye_vision_office';
const MANAGER_COLLECTION = 'eye_vision_manager';
const CLOUD_ACCESS_COLLECTION = 'cloud_access_control';
const CLOUD_ACCESS_DOC_ID = 'config';

const DEFAULT_LEGACY_ROOT =
  'C:\\Users\\ronaldo.silva\\Downloads\\eye-vision-v1.0.4-main\\eye-vision-v1.0.4-main\\EMPRESTIMOS-MASTER-master';

function log(msg) {
  console.info(msg);
}

function resolveLegacyRoot() {
  return String(process.env.LEGACY_EYE_VISION_ROOT || DEFAULT_LEGACY_ROOT).trim();
}

function resolveFirebaseConfigPath() {
  const custom = String(process.env.FIREBASE_APP_CONFIG_PATH || '').trim();
  if (custom && existsSync(custom)) return custom;
  const legacy = path.join(
    resolveLegacyRoot(),
    'vendor',
    'gestao-contabil',
    'firebase-applet-config.json',
  );
  return legacy;
}

function loadFirebaseConfig() {
  const configPath = resolveFirebaseConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      `firebase-applet-config.json não encontrado em ${configPath}. Defina LEGACY_EYE_VISION_ROOT ou FIREBASE_APP_CONFIG_PATH.`,
    );
  }
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

function mapOfficePayload(row) {
  if (!row || typeof row !== 'object') return {};
  const extra = { ...(row.extra_storage && typeof row.extra_storage === 'object' ? row.extra_storage : {}) };
  if (Array.isArray(row.deleted_companies)) {
    extra.deleted_companies = row.deleted_companies;
  }
  return {
    name: String(row.name || ''),
    companies_registry: Array.isArray(row.companies_registry) ? row.companies_registry : [],
    selected_company: String(row.selected_company || ''),
    pricing_companies_registry: Array.isArray(row.pricing_companies_registry)
      ? row.pricing_companies_registry
      : [],
    pricing_selected_company: String(row.pricing_selected_company || ''),
    simulador_contracts: Array.isArray(row.simulador_contracts) ? row.simulador_contracts : [],
    simulador_parcelamentos: Array.isArray(row.simulador_parcelamentos)
      ? row.simulador_parcelamentos
      : [],
    simulador_aplicacoes: Array.isArray(row.simulador_aplicacoes) ? row.simulador_aplicacoes : [],
    simulador_precificacao: Array.isArray(row.simulador_precificacao) ? row.simulador_precificacao : [],
    extra_storage: extra,
  };
}

async function fetchFirestoreWorkspace(db, officeToken) {
  const tok = String(officeToken || '').trim();
  if (!tok) return null;

  const safeId = tok.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const officeSnap = await getDoc(doc(db, OFFICE_COLLECTION, safeId));
  const officeData = officeSnap.exists() ? officeSnap.data() : null;

  const managersSnap = await getDocs(
    query(collection(db, MANAGER_COLLECTION), where('office_token', '==', tok)),
  );
  const managers = mergeManagerCloudDocuments(managersSnap.docs);

  return {
    office_token: tok,
    office: officeData,
    managers,
  };
}

async function listOfficeTokens(db) {
  const filter = String(process.env.FIREBASE_SYNC_OFFICE_TOKEN || '').trim();
  if (filter) return [filter];

  const tokens = new Set();
  const officeSnap = await getDocs(collection(db, OFFICE_COLLECTION));
  for (const d of officeSnap.docs) {
    const data = d.data() || {};
    const tok = String(data.office_token || '').trim();
    if (tok) tokens.add(tok);
  }

  if (tokens.size === 0) {
    const managersSnap = await getDocs(collection(db, MANAGER_COLLECTION));
    for (const d of managersSnap.docs) {
      const tok = String(d.data()?.office_token || '').trim();
      if (tok) tokens.add(tok);
    }
  }

  return [...tokens];
}

async function writeToDocker(officeToken, bundle) {
  const token = String(officeToken || '').trim();
  if (!token) return false;

  const officePayload = mapOfficePayload(bundle.office);
  const hasOffice =
    (officePayload.companies_registry?.length ?? 0) > 0 ||
    (officePayload.simulador_contracts?.length ?? 0) > 0 ||
    Object.keys(officePayload.extra_storage || {}).length > 0;

  if (hasOffice || bundle.office) {
    await repo.setOffice(token, officePayload, 'firebase-migrate');
  }

  for (const manager of bundle.managers || []) {
    const slug = String(manager.company_slug || '').trim();
    if (!slug) continue;
    const data = manager.data || {};
    if (!Object.keys(data).length) continue;
    await repo.setManager(
      token,
      slug,
      {
        company_slug: slug,
        company_name: String(manager.company_name || ''),
        data,
      },
      'firebase-migrate',
    );
  }

  return true;
}

function markMigrated(meta) {
  mkdirSync(path.dirname(MIGRATED_FLAG), { recursive: true });
  writeFileSync(MIGRATED_FLAG, JSON.stringify(meta, null, 2), 'utf8');
}

function wasMigrated() {
  return existsSync(MIGRATED_FLAG);
}

export function loadCloudAccessCache() {
  if (!existsSync(CLOUD_ACCESS_CACHE)) return null;
  try {
    return JSON.parse(readFileSync(CLOUD_ACCESS_CACHE, 'utf8'));
  } catch {
    return null;
  }
}

function saveCloudAccessCache(config) {
  mkdirSync(path.dirname(CLOUD_ACCESS_CACHE), { recursive: true });
  writeFileSync(CLOUD_ACCESS_CACHE, JSON.stringify(config, null, 2), 'utf8');
}

function collectConfigOfficeTokens(config) {
  const tokens = new Set();
  const fromArr = Array.isArray(config?.company_access_tokens)
    ? config.company_access_tokens.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  for (const tok of fromArr) tokens.add(tok);
  const legacy = String(config?.company_access_token || '').trim();
  if (legacy) tokens.add(legacy);
  const offices = config?.eye_vision_offices;
  if (offices && typeof offices === 'object') {
    for (const tok of Object.keys(offices)) {
      const key = String(tok || '').trim();
      if (key) tokens.add(key);
    }
  }
  return [...tokens];
}

async function fetchCloudAccessConfig(db) {
  const snap = await getDoc(doc(db, CLOUD_ACCESS_COLLECTION, CLOUD_ACCESS_DOC_ID));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

async function provisionConfigTokens(config) {
  for (const token of collectConfigOfficeTokens(config)) {
    await repo.ensureOfficeRow(token, 'firebase-migrate');
  }
}

/**
 * @param {{ force?: boolean, skipDockerEnsure?: boolean }} [options]
 */
export async function migrateFromFirebase(options = {}) {
  const force = options.force ?? process.argv.includes('--force');

  if (!isDevMigrationEnabled()) {
    log('[storage:firebase] Migração Firebase bloqueada fora do ambiente de desenvolvimento.');
    return { ok: false, error: 'dev_only' };
  }

  const email = String(process.env.FIREBASE_MIGRATE_EMAIL || '').trim();
  const password = String(process.env.FIREBASE_MIGRATE_PASSWORD || '').trim();
  if (!email || !password) {
    log(
      '[storage:firebase] Defina FIREBASE_MIGRATE_EMAIL e FIREBASE_MIGRATE_PASSWORD no .env para migrar do Firestore.',
    );
    return { ok: true, skipped: true, reason: 'no_credentials' };
  }

  if (!force && wasMigrated()) {
    log('[storage:firebase] Migração já executada — use --force para repetir.');
    return { ok: true, skipped: true, reason: 'already_migrated' };
  }

  if (!options.skipDockerEnsure) {
    log('[storage:firebase] Preparando Docker local…');
    const storage = await ensureStorageUp({ log, skipSupabaseSync: true });
    if (!storage.ok && !storage.skipped) {
      return { ok: false, error: 'docker_not_ready' };
    }
  }

  const cfg = loadFirebaseConfig();
  log(`[storage:firebase] Projeto: ${cfg.projectId} · DB: ${cfg.firestoreDatabaseId || '(default)'}`);

  const app = initializeApp(cfg, `eye-vision-migrate-${Date.now()}`);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId || undefined);

  log('[storage:firebase] Autenticando no Firebase…');
  const session = await signInWithEmailAndPassword(auth, email, password);
  log(`[storage:firebase] Autenticado: ${session.user.email}`);

  const cloudAccess = await fetchCloudAccessConfig(db);
  if (cloudAccess) {
    saveCloudAccessCache(cloudAccess);
    const configTokens = collectConfigOfficeTokens(cloudAccess);
    await provisionConfigTokens(cloudAccess);
    log(
      `[storage:firebase] Gestão Contábil (cloud_access_control) — ${configTokens.length} token(s), ${Object.keys(cloudAccess.clients || {}).length} cliente(s).`,
    );
  } else {
    log('[storage:firebase] cloud_access_control/config não encontrado no Firestore.');
  }

  const tokens = await listOfficeTokens(db);
  if (tokens.length === 0) {
    log('[storage:firebase] Nenhum escritório em eye_vision_office.');
    return { ok: true, migrated: 0 };
  }

  log(`[storage:firebase] Migrando ${tokens.length} escritório(s) → Docker…`);
  let migrated = 0;

  for (const token of tokens) {
    const bundle = await fetchFirestoreWorkspace(db, token);
    if (!bundle) continue;
    const hasData =
      bundle.office ||
      (bundle.managers?.length ?? 0) > 0;
    if (!hasData) {
      log(`[storage:firebase] ${token.slice(0, 10)}… vazio — ignorado.`);
      continue;
    }
    await writeToDocker(token, bundle);
    migrated += 1;
    log(
      `[storage:firebase] ${token.slice(0, 10)}… OK — ${bundle.managers?.length ?? 0} empresa(s) gerencial.`,
    );
  }

  markMigrated({
    at: new Date().toISOString(),
    migrated,
    tokens,
    cloudAccessTokens: cloudAccess ? collectConfigOfficeTokens(cloudAccess) : [],
    cloudAccessRestored: Boolean(cloudAccess),
    legacyRoot: resolveLegacyRoot(),
    firebaseProject: cfg.projectId,
  });

  log(`[storage:firebase] Concluído — ${migrated} escritório(s) no Docker.`);
  await closePgPool().catch(() => {});
  return { ok: true, migrated };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  migrateFromFirebase()
    .then((result) => process.exit(result.ok ? 0 : 1))
    .catch((err) => {
      console.error('[storage:firebase] Erro:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
