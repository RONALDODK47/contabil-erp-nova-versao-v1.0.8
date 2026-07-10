# Produção — SOFTWARE NOVO PRO

Esta pasta (`SOFTWARE-NOVO-PRO/`) é a **versão pronta para deploy**. Use-a como **Root Directory** no Vercel e no Render.

> **Importante:** Supabase usa o **mesmo PostgreSQL** que o Docker local — só muda a `DATABASE_URL` no Render. Para PDFs na nuvem, configure **Supabase Storage** (API S3) no backend.

## Stack gratuita

| Camada   | Serviço  | O que roda                       |
| -------- | -------- | -------------------------------- |
| Frontend | Vercel   | `npm run build` → pasta `dist/`  |
| Backend  | Render   | `scripts/agent-api-server.mjs`   |
| Banco    | Supabase | PostgreSQL (mesmo `schema.sql`)  |
| PDFs     | Supabase | Storage S3 (`MINIO_S3_ENDPOINT`) |

## Antes do deploy (no seu PC)

1. Copie [`.env.production.example`](.env.production.example) e preencha:

```env
DATABASE_URL=postgresql://postgres.[ref]:[SENHA]@...pooler.supabase.com:6543/postgres
GEMINI_API_KEY=sua_chave
MINIO_S3_ENDPOINT=https://[ref].supabase.co/storage/v1/s3
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=eye-vision
```

1. Rode na pasta `SOFTWARE-NOVO-PRO`:

```bash
npm install
npm run production:setup
```

Isso aplica o schema no Supabase e valida Postgres + Storage de PDFs.

## Deploy

### Render (API)

- Arquivo: [`render.yaml`](render.yaml)
- Health: `/health` e `/api/agent/health`
- Variáveis: ver `.env.production.example` (seção Render)

### Vercel (frontend)

- Arquivo: [`vercel.json`](vercel.json)
- Variáveis:

```env
VITE_STORAGE_BACKEND=supabase
VITE_AGENT_API_URL=https://SEU-SERVICO.onrender.com/api/agent
```

**Não** coloque `GEMINI_API_KEY` no Vercel.

## Desenvolvimento local (mesma pasta)

```bash
copy .env.example .env
npm run storage:setup
npm run dev
```

Localhost usa Docker automaticamente (`VITE_STORAGE_BACKEND=docker`).

## Documentação completa

- [deploy-vercel-render-supabase.md](docs/deploy-vercel-render-supabase.md) — passo a passo
- [docker-persistencia-seguranca.md](docs/docker-persistencia-seguranca.md) — Docker local
- [ARQUITETURA.md](docs/ARQUITETURA.md) — mapa do código

## Segurança em produção

| Camada | Proteção |
| ------ | -------- |
| **Vercel** | Só `VITE_*` públicas; sem `GEMINI_API_KEY` nem senhas de banco |
| **Render** | `STORAGE_BACKEND=supabase`, CORS com URL exata do app, guard na subida |
| **API** | Token de escritório validado; rotas de migração bloqueadas em produção |
| **Dados** | Postgres + Storage Supabase (SSL); PDFs no bucket privado |
| **Dev local** | Docker em `127.0.0.1`; migrações Firebase/Supabase→Docker só no PC |

Antes do deploy:

```bash
# Com .env de produção preenchido (STORAGE_BACKEND=supabase)
npm run production:setup
```

O `production:check` recusa CORS `*`, credenciais Firebase no servidor e chaves secretas no frontend.
