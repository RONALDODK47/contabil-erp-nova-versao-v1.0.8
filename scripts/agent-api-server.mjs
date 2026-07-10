/**
 * Servidor dedicado do agente IA — padrão FlowMind (processo separado do Vite).
 * Porta padrão: 8790 · rotas em /agent/*
 */
import './production-start-guard.mjs';
import './load-env.mjs';
import express from 'express';
import { registerAgentRoutes } from './agent-api-routes.mjs';
import { registerFiscalHealthStubs } from './fiscal-health-stubs.mjs';

const app = express();
/** Render/Railway injetam PORT; local usa AGENT_API_PORT ou 8790. */
const PORT = Number(process.env.PORT || process.env.AGENT_API_PORT || 8790);
const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const HOST =
  process.env.AGENT_API_HOST || (isProd ? '0.0.0.0' : '127.0.0.1');

function sanitizeCorsOrigin(raw) {
  return String(raw || '')
    .replace(/^["']|["']$/g, '')
    .replace(/[\r\n\u0000-\u001F\u007F]/g, '')
    .trim();
}

const corsOrigins = String(process.env.CORS_ALLOWED_ORIGIN || '')
  .split(',')
  .map((o) => sanitizeCorsOrigin(o))
  .filter(Boolean);

function isValidCorsOrigin(origin) {
  if (!origin || /[\r\n]/.test(origin)) return false;
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveCorsOrigin(requestOrigin) {
  const reqOrigin = sanitizeCorsOrigin(requestOrigin);
  if (!isProd) return corsOrigins[0] || reqOrigin || '*';
  if (!reqOrigin) {
    const fallback = corsOrigins.find(isValidCorsOrigin);
    return fallback || '';
  }
  if (corsOrigins.includes(reqOrigin)) return reqOrigin;
  if (corsOrigins.some((o) => o.endsWith('.github.io') && reqOrigin.endsWith('.github.io'))) {
    return reqOrigin;
  }
  const fallback = corsOrigins.find(isValidCorsOrigin);
  return fallback || '';
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use((req, res, next) => {
  const requestOrigin = String(req.headers.origin || '').trim();
  const allowed = resolveCorsOrigin(requestOrigin);
  if (allowed && (allowed === '*' || isValidCorsOrigin(allowed))) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Office-Token, X-User-Id',
  );
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

/** Workspace/pastas podem trazer PDF base64 — limite maior. */
app.use(express.json({ limit: '64mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'agent-api-server',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

const agentRouter = express();
registerAgentRoutes(agentRouter);
app.use(agentRouter);

/** Alias /api/agent/* → mesmas rotas (VITE_AGENT_API_URL em produção). */
app.use('/api/agent', (req, res, next) => {
  const suffix = req.url.startsWith('/') ? req.url : `/${req.url}`;
  req.url = `/agent${suffix}`;
  agentRouter(req, res, next);
});

/** Health-checks fiscais para o frontend em GitHub Pages (sem fiscal-api separado). */
const fiscalHealthRouter = express();
registerFiscalHealthStubs(fiscalHealthRouter);
app.use('/api/fiscal-nfe', fiscalHealthRouter);

const server = app.listen(PORT, HOST, () => {
  console.info(
    `[agent-api] Servidor online — http://${HOST}:${PORT}/agent/health · /api/agent/health`,
  );
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`[agent-api] Porta ${PORT} em uso — rode npm run dev:free-ports`);
  } else {
    console.error('[agent-api] Falha ao subir:', err?.message || err);
  }
  process.exit(1);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
