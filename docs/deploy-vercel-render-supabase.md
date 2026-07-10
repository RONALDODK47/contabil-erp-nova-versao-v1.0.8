# Deploy em produção — Vercel + Render + Supabase

Guia completo para subir o Eye Vision **sem custo** (tier gratuito).

> **Importante:** Supabase usa o mesmo PostgreSQL que o Docker — só muda a `DATABASE_URL` no Render. Para PDFs na nuvem, configure Supabase Storage (S3) no backend.

## Visão geral

| Camada   | Serviço           | Função                       |
| -------- | ----------------- | ---------------------------- |
| Frontend | Vercel ou Netlify | React estático (`dist/`)     |
| Backend  | Render            | `agent-api` — IA + workspace |
| Banco    | Supabase          | PostgreSQL                   |
| Arquivos | Supabase Storage  | PDFs de extrato (API S3)     |

## Pré-requisitos

1. Conta [GitHub](https://github.com), [Vercel](https://vercel.com), [Render](https://render.com), [Supabase](https://supabase.com)
2. Chave [Gemini API](https://aistudio.google.com/apikey)
3. Repositório conectado — use a pasta **`SOFTWARE-NOVO-PRO`** como Root Directory no Vercel/Render (monorepo)

---

## Passo 1 — Supabase (banco + storage)

### 1.1 Criar projeto

1. [supabase.com](https://supabase.com) → New project
1. Anote o **Project ref** (ex.: `abcd1234`)

### 1.2 Connection string

1. **Settings → Database → Connection string**
1. Modo **Transaction** pooler (porta 6543)
1. Copie a URI — será `DATABASE_URL` no Render

### 1.3 Aplicar schema

No seu PC (com `.env` temporário):

```bash
STORAGE_BACKEND=supabase DATABASE_URL="postgresql://..." npm run storage:migrate
```

Ou cole `scripts/storage/schema.sql` no **SQL Editor** do Supabase.

### 1.4 Bucket para PDFs

1. **Storage → New bucket** → nome `eye-vision` (privado)
1. **Storage → Configuration → S3 connection** → Enable S3
1. Gere **Access Key** e **Secret Key**
1. Endpoint S3: `https://[ref].supabase.co/storage/v1/s3`

---

## Passo 2 — Render (agent-api)

### Opção A — Blueprint automático

1. Render → **New → Blueprint**
1. Conecte o repo — detecta `render.yaml`
1. Root Directory: `SOFTWARE-NOVO-PRO` (se monorepo)
1. Preencha variáveis secretas no painel

### Opção B — Manual

| Campo        | Valor                               |
| ------------ | ----------------------------------- |
| Build        | `npm install`                       |
| Start        | `node scripts/agent-api-server.mjs` |
| Health check | `/health`                           |

### Variáveis no Render

```env
NODE_ENV=production
AGENT_API_HOST=0.0.0.0
STORAGE_BACKEND=supabase
DATABASE_URL=postgresql://postgres.[ref]:[SENHA]@aws-0-xxx.pooler.supabase.com:6543/postgres
GEMINI_API_KEY=sua_chave
GEMINI_MODEL=gemini-2.5-flash
CORS_ALLOWED_ORIGIN=https://seu-app.vercel.app

MINIO_S3_ENDPOINT=https://[ref].supabase.co/storage/v1/s3
MINIO_ACCESS_KEY=sua_s3_access_key
MINIO_SECRET_KEY=sua_s3_secret_key
MINIO_BUCKET=eye-vision
MINIO_REGION=us-east-1
```

Valide antes do deploy:

```bash
STORAGE_BACKEND=supabase DATABASE_URL="..." GEMINI_API_KEY="..." \
  MINIO_S3_ENDPOINT="..." MINIO_ACCESS_KEY="..." MINIO_SECRET_KEY="..." \
  npm run production:check
```

Teste após deploy:

- `https://SEU-SERVICO.onrender.com/health`
- `https://SEU-SERVICO.onrender.com/api/agent/health`

---

## Passo 3 — Vercel (frontend)

1. Importe o repositório
1. **Root Directory:** `SOFTWARE-NOVO-PRO`
1. Framework: Vite (detecta automaticamente)
1. Build: `npm run build` → Output: `dist`

### Variáveis no Vercel

```env
VITE_STORAGE_BACKEND=supabase
VITE_AGENT_API_URL=https://SEU-SERVICO.onrender.com/api/agent
```

**Não** coloque `GEMINI_API_KEY` no Vercel — fica só no Render.

Deploy → acesse `https://seu-app.vercel.app`

---

## Passo 4 — Netlify (alternativa ao Vercel)

1. Conecte o repo, Root: `SOFTWARE-NOVO-PRO`
1. `netlify.toml` já define build e redirects SPA
1. Mesmas variáveis `VITE_*` do Vercel

---

## Desenvolvimento local (Docker)

```bash
copy .env.example .env
npm run storage:setup
npm run dev
```

- `localhost` → Docker Postgres/MinIO automaticamente
- Dados em volumes persistentes — ver [docker-persistencia-seguranca.md](./docker-persistencia-seguranca.md)

---

## Fluxo de dados

```text
[Browser localhost]  →  Vite /api/agent  →  agent-api  →  Docker Postgres/MinIO

[Browser Vercel]     →  Render /api/agent  →  Supabase Postgres + Storage
```

Mesma API (`/agent/workspace/*`), mesmo schema — só muda `DATABASE_URL` e storage de blobs.

---

## Checklist pós-deploy

- [ ] `/health` e `/api/agent/health` respondem 200 no Render
- [ ] Login e criação de empresa funcionam
- [ ] Salvamento persiste após reload
- [ ] Upload de PDF de extrato grava e baixa corretamente
- [ ] IA (regras de conciliação) responde

---

## Segurança

- Senhas só em variáveis de ambiente (use `.env.production.example` como modelo)
- `CORS_ALLOWED_ORIGIN` = domínio exato do frontend em produção
- Supabase: connection pooling; RLS se expuser REST direto
- Docker local: portas em `127.0.0.1` (`docker-compose.dev.yml`)
- Nunca `docker compose down -v` em produção

Ver também: [docker-persistencia-seguranca.md](./docker-persistencia-seguranca.md)
