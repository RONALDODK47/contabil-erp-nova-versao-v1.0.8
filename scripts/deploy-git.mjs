/**
 * Publica código no GitHub (dispara deploy automático se Vercel/Render estiverem conectados).
 * Uso: npm run deploy:git
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REMOTE = 'https://github.com/RONALDODK47/eye-vision-v1.0.7.git';

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: false,
    ...opts,
  });
  return result.status ?? 1;
}

function git(...args) {
  const result = spawnSync('git', args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    windowsHide: false,
  });
  return result.status ?? 1;
}

console.info('[deploy:git] Publicando no GitHub…\n');

const remote = process.env.DEPLOY_GIT_REMOTE || DEFAULT_REMOTE;

if (git('rev-parse', '--is-inside-work-tree') !== 0) {
  if (git('init') !== 0) process.exit(1);
}

if (git('remote', 'get-url', 'origin') !== 0) {
  if (git('remote', 'add', 'origin', remote) !== 0) process.exit(1);
}

git('add', '-A');
const status = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root, shell: true });
if ((status.status ?? 1) !== 0) {
  const msg = process.env.DEPLOY_GIT_MESSAGE || 'Deploy: parser plano Dominio, descricao completa e fix build workers';
  if (git('commit', '-m', msg) !== 0) process.exit(1);
}

git('branch', '-M', 'main');

if (git('ls-remote', '--heads', 'origin', 'main') === 0) {
  console.info('[deploy:git] Sincronizando com origin/main…');
  const pull = git('pull', 'origin', 'main', '--rebase', '--autostash');
  if (pull !== 0) {
    console.error('[deploy:git] Conflito no pull — resolva manualmente e rode npm run deploy:git de novo.');
    process.exit(1);
  }
}

if (git('push', '-u', 'origin', 'main') !== 0) {
  console.error('[deploy:git] Push falhou. Verifique permissões no GitHub.');
  process.exit(1);
}

console.info('\n[deploy:git] Push concluído →', remote);
console.info('  Se Vercel/Render estiverem ligados ao repo, o deploy inicia automaticamente.\n');
