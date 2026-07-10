# SOFTWARE NOVO PRO

Versão **enxuta e pronta para produção** do Eye Vision.

> **Deploy:** use esta pasta como **Root Directory** no Vercel e Render.
> Guia: [`PRODUCAO.md`](PRODUCAO.md) · [`docs/deploy-vercel-render-supabase.md`](docs/deploy-vercel-render-supabase.md)

## Produção (Supabase + Render + Vercel)

```bash
npm install
# Preencha DATABASE_URL, GEMINI_API_KEY, MINIO_S3_* (ver .env.production.example)
npm run production:setup    # schema Supabase + validação
npm run production:check    # só validar
```

**Importante:** Supabase usa o mesmo PostgreSQL do Docker — só muda `DATABASE_URL` no Render. PDFs na nuvem: Supabase Storage (`MINIO_S3_ENDPOINT`).

| Serviço   | Config                        |
| --------- | ----------------------------- |
| Render    | `render.yaml`                 |
| Vercel    | `vercel.json`                 |
| Netlify   | `netlify.toml`                |
| Variáveis | `.env.production.example`     |

## Desenvolvimento local

```bash
npm install
copy .env.example .env          # Windows — edite senhas e GEMINI_API_KEY
npm run storage:setup           # Docker Postgres + MinIO + schema
npm run dev                     # http://localhost:3000
```

## Estrutura (visão rápida)

| Pasta / arquivo       | Função                                                    |
| --------------------- | --------------------------------------------------------- |
| `src/`                | Frontend React — módulo principal em `src/contabilfacil/` |
| `scripts/`            | Backends Node — IA (`:8790`) e fiscal (`:8780`)           |
| `scripts/storage/`    | Persistência Postgres + MinIO                             |
| `public/`             | Assets estáticos e bundles BCB/contratos                  |
| `data/`               | Fonte mínima para gerar bundles                           |
| `docker-compose*.yml` | Infraestrutura local                                      |
| `docs/`               | Deploy e segurança Docker                                 |

Detalhes: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)

## Scripts principais

| Comando                   | Descrição                                             |
| ------------------------- | ----------------------------------------------------- |
| `npm run dev`             | Fiscal + Agent API + Vite                             |
| `npm run dev:vite`        | Só interface (precisa do agent-api em outro terminal) |
| `npm run agent-api`       | Backend IA e storage (:8790)                          |
| `npm run storage:up`      | Sobe Postgres + MinIO                                 |
| `npm run storage:migrate` | Aplica schema SQL                                     |
| `npm run build`           | Build de produção                                     |

## Deploy em produção

Detalhes: [`PRODUCAO.md`](PRODUCAO.md) e [`docs/deploy-vercel-render-supabase.md`](docs/deploy-vercel-render-supabase.md)

## Atualizar esta pasta

No repositório principal: `npm run pack:novo-pro`

## O que não está nesta pasta

Testes, scripts de patch/debug, recovery, `leitor-e-recortador-de-extratos/` duplicado, exports `modelo_*.xlsx`, `node_modules/` e `dist/` (gerados localmente).

## Gestão Contábil (opcional)

`vendor/gestao-contabil/` não vem na cópia. O app usa fallbacks em `src/gestaoContabil/`. Para integração completa, copie o vendor e rode `npm run gestao:sync-deps`.
