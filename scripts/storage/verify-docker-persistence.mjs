#!/usr/bin/env node
/**
 * Verifica se os volumes Docker do Eye Vision existem e se Postgres/MinIO respondem.
 * Uso: npm run storage:verify
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const VOLUMES = ['eye_vision_pg_data', 'eye_vision_minio_data'];
const BIND_DIRS = ['data/docker/postgres', 'data/docker/minio'];

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function warn(msg) {
  console.warn(`  ⚠ ${msg}`);
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
}

console.log('\n[storage:verify] Persistência Docker — Eye Vision\n');

let issues = 0;

for (const vol of VOLUMES) {
  const out = run(`docker volume inspect ${vol} --format "{{.Name}}"`);
  if (out === vol) ok(`Volume nomeado "${vol}" existe`);
  else {
    fail(`Volume "${vol}" não encontrado — rode npm run storage:up`);
    issues += 1;
  }
}

const root = resolve(process.cwd());
for (const rel of BIND_DIRS) {
  const abs = resolve(root, rel);
  if (existsSync(abs)) ok(`Bind mount local: ${rel}`);
}

const pg = run('docker inspect eye-vision-postgres --format "{{.State.Health.Status}}"');
if (pg === 'healthy') ok('PostgreSQL saudável');
else if (pg) warn(`PostgreSQL status: ${pg}`);
else warn('Contêiner eye-vision-postgres não está rodando');

const minio = run('docker inspect eye-vision-minio --format "{{.State.Health.Status}}"');
if (minio === 'healthy') ok('MinIO saudável');
else if (minio) warn(`MinIO status: ${minio}`);
else warn('Contêiner eye-vision-minio não está rodando');

const pgPorts = run(
  'docker port eye-vision-postgres 5432 2>nul || docker port eye-vision-postgres 5432 2>/dev/null',
);
if (!pgPorts) ok('PostgreSQL sem porta publicada (rede interna — recomendado em produção)');
else if (/127\.0\.0\.1/.test(pgPorts)) ok(`PostgreSQL exposto só em localhost: ${pgPorts}`);
else warn(`PostgreSQL com porta exposta: ${pgPorts} — restrinja a 127.0.0.1 ou use storage:up:prod`);

console.log('\nLembretes:');
console.log('  • Pasta local do app (File System Access): configure no Eye Vision — não é o Docker.');
console.log('  • Nunca use docker commit para salvar dados.');
console.log('  • Nunca use docker compose down -v em produção.\n');

process.exit(issues > 0 ? 1 : 0);
