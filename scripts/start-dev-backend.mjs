/**
 * Sobe Docker + agent-api quando o Vite roda sozinho (ex.: Cursor / npm run dev:vite).
 * Ignorado quando EYE_VISION_DEV_ALL=1 (npm run dev já subiu tudo).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { ensureStorageUp } from './storage/ensure-up.mjs';
import './load-env.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_API_PORT = Number(process.env.AGENT_API_PORT || 8790);
const agentScript = path.join(root, 'scripts', 'agent-api-server.mjs');

async function isHealthy() {
  try {
    const res = await fetch(`http://127.0.0.1:${AGENT_API_PORT}/agent/workspace/health`);
    const json = await res.json().catch(() => ({}));
    return res.ok && json.ok === true;
  } catch {
    return false;
  }
}

if (process.env.EYE_VISION_DEV_ALL === '1') {
  process.exit(0);
}

if (await isHealthy()) {
  process.exit(0);
}

console.info('[dev-backend] Subindo Docker + agent-api para o Eye Vision…');
await ensureStorageUp({ log: (m) => console.info(m) });

if (!(await isHealthy()) && existsSync(agentScript)) {
  const child = spawn(process.execPath, [agentScript], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, STORAGE_BACKEND: process.env.STORAGE_BACKEND || 'docker' },
  });
  child.unref();
}

const start = Date.now();
while (Date.now() - start < 60_000) {
  if (await isHealthy()) {
    console.info('[dev-backend] agent-api pronto em :' + AGENT_API_PORT);
    process.exit(0);
  }
  await delay(500);
}

console.warn('[dev-backend] agent-api não respondeu — use npm run dev');
process.exit(1);
