# Arquitetura — SOFTWARE NOVO PRO

Mapa para o programador entender o projeto **só de bater o olho**.

## Fluxo em desenvolvimento

```text
Browser (:3000)
    │
    ├── Vite (src/main.tsx → App.tsx → ContabilFacilApp)
    │       └── proxy /api/fiscal-nfe → :8780
    │       └── proxy /agent/* → :8790 (ou fallback embutido no Vite)
    │
    ├── Agent API (:8790)  scripts/agent-api-server.mjs
    │       └── IA (Gemini), regras de conciliação, workspace
    │       └── scripts/storage/ → Postgres + MinIO
    │
    └── Fiscal API (:8780)  scripts/fiscal-nfe-api.mjs
            └── NF-e, SEFAZ, ICMS
```

## `src/` — Frontend

| Subpasta           | Responsabilidade                                                             |
| ------------------ | ---------------------------------------------------------------------------- |
| `contabilfacil/`   | **Módulo principal** - gerencial, extrato, fiscal, empréstimos, pricing      |
| `gestaoContabil/`  | Shell de login e navegação (fallback sem vendor)                             |
| `extratoVision/`   | Parsers e utilitários de extrato/OCR                                         |
| `lib/`             | Clientes API, storage, leitor/recortador integrado                           |
| `services/`        | BCB, calendário bancário, integrações                                        |
| `components/`      | Componentes globais (ex.: ErrorBoundary)                                     |
| `data/`            | Mirrors dos bundles JSON (dev/build)                                         |

**Entry:** `index.html` → `src/main.tsx` → `src/App.tsx`

## `scripts/` — Backend Node

| Arquivo / pasta                        | Porta | Função                              |
| -------------------------------------- | ----- | ----------------------------------- |
| `dev-all.mjs`                          | —     | Orquestra fiscal + agent-api + Vite |
| `agent-api-server.mjs`                 | 8790  | Servidor Express do agente IA       |
| `agent-api-routes.mjs`                 | —     | Rotas /agent/*                      |
| `ai-*.mjs`, `gemini-*.mjs`             | —     | IA, extração, regras de contas      |
| `fiscal-nfe-api.mjs`                   | 8780  | API fiscal NF-e                     |
| `nfe-*.mjs`, `icms-sefaz-routes.mjs`   | —     | XML, SEFAZ, certificado A1          |
| `storage/`                             | —     | Postgres, MinIO, rotas de workspace |
| `download-bcb-series.mjs`              | —     | Bundle séries BCB                   |
| `bundle-saved-contracts.mjs`           | —     | Bundle contratos salvos             |

## `scripts/storage/`

| Arquivo                 | Função                                   |
| ----------------------- | ---------------------------------------- |
| `schema.sql`            | DDL Postgres                             |
| `migrate.mjs`           | Aplica schema                            |
| `pg-client.mjs`         | Pool Postgres (docker ou Supabase)       |
| `minio-client.mjs`      | Objetos (PDFs, backups)                  |
| `workspace-routes.mjs`  | API REST de persistência                 |
| `workspace-repo.mjs`    | Repositório de dados por escritório      |

## Persistência de dados

```text
Sessão no browser (memória)
        ↓
Agent API /agent/workspace/*
        ↓
Postgres (metadados) + MinIO (arquivos)
```

Sem dados operacionais no `localStorage`. Backend escolhido por `VITE_STORAGE_BACKEND` (docker local / supabase nuvem).

## Infra — Docker

- `docker-compose.yml` — produção local
- `docker-compose.dev.yml` — portas em 127.0.0.1
- `docker-compose.bind.yml` — bind mount opcional em `data/docker/`

## Variáveis essenciais (`.env`)

- `DATABASE_URL`, credenciais MinIO
- `GEMINI_API_KEY`
- `VITE_STORAGE_BACKEND` — `docker` ou `supabase`
