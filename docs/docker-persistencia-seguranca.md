# Persistência e segurança — Docker + pasta local

Este guia cobre como os dados do **Eye Vision** ficam protegidos no **Docker** (PostgreSQL + MinIO) e na **pasta local** configurada no navegador.

## O que fica onde

| Destino                                   | Conteúdo                                              | Persistência                                              |
| ----------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| **Volume Docker** `eye_vision_pg_data`    | Banco PostgreSQL (empresas, extrato, regras, etc.)    | Sobrevive a restart do contêiner e reboot do servidor     |
| **Volume Docker** `eye_vision_minio_data` | PDFs e blobs (MinIO)                                  | Idem                                                      |
| **Pasta local** (configurada no app)      | Espelho JSON versionado (`eye-vision-dados_*.json`)   | Fica no disco que você escolheu no Windows                |
| **Navegador**                             | Só token de login e meta leve                         | Dados operacionais **não** ficam no navegador             |

Os três primeiros trabalham juntos: memória na sessão → pasta → Docker.

---

## 1. Volumes Docker (dados não se perdem ao reiniciar)

O `docker-compose.yml` declara volumes **nomeados** persistentes:

- `eye_vision_pg_data` → `/var/lib/postgresql/data`
- `eye_vision_minio_data` → `/data`

### Subir em desenvolvimento (portas só em localhost)

```bash
copy .env.example .env
# Edite .env e defina senhas fortes

npm run storage:up
npm run storage:migrate
npm run storage:verify
```

Isso usa `docker-compose.dev.yml`: Postgres `127.0.0.1:5432`, MinIO `127.0.0.1:9000`.

### Subir em servidor (sem expor banco na internet)

```bash
npm run storage:up:prod
```

Apenas a rede interna `eye_vision_internal` — **sem** `ports:` no Postgres/MinIO. Só outro contêiner na mesma rede acessa o banco.

### Gravar em pastas visíveis no host (bind mount)

```bash
npm run storage:up:bind
```

Cria `./data/docker/postgres` e `./data/docker/minio` no projeto (gitignored). Útil para backup direto da pasta.

---

## 2. Rede isolada

- Rede `eye_vision_internal`: Postgres e MinIO conversam entre si.
- **Produção:** não publique `5432` nem `9000` na internet.
- **Dev:** portas amarradas em `127.0.0.1` (não em `0.0.0.0`).
- Acesso remoto ao banco: use **VPN** ou **SSH tunnel** (`ssh -L 5432:127.0.0.1:5432 usuario@servidor`).

---

## 3. Não rodar como administrador desnecessário

- **PostgreSQL** (`postgres:16-alpine`): já executa como usuário `postgres` (não-root).
- **MinIO**: credenciais `MINIO_ROOT_USER` são do *produto*, não do Linux. Para endurecer, após o primeiro `up` você pode fixar UID/GID no volume (consulte a doc oficial do MinIO).

---

## 4. Senhas e segredos

- **Nunca** commite `.env` (já está no `.gitignore`).
- Copie `.env.example` → `.env` e altere:
  - `POSTGRES_PASSWORD`
  - `MINIO_ROOT_PASSWORD` / `MINIO_SECRET_KEY`
  - `DATABASE_URL` com a mesma senha do Postgres
- O `docker-compose.yml` lê variáveis do `.env` — senhas **não** ficam fixas no compose.

Em produção avançada, use **Docker Secrets** ou o cofre do seu provedor (Azure Key Vault, AWS Secrets Manager, etc.).

---

## 5. Erros comuns — evite

| Comando / prática                        | Risco                                     |
| ---------------------------------------- | ----------------------------------------- |
| `docker compose down -v`                 | **Apaga os volumes** e todos os dados     |
| `docker commit` para “salvar” fotos/PDFs | Imagem gigante, lenta, anti-padrão        |
| `ports: '5432:5432'` em servidor público | Banco exposto na internet                 |
| Senhas no `docker-compose.yml`           | Vazamento em git                          |

### Comandos seguros

```bash
# Parar sem apagar dados
npm run storage:down

# Reiniciar mantendo dados
docker compose restart

# Verificar volumes
npm run storage:verify
```

---

## 6. Pasta local configurada no app

No Eye Vision, escolha a pasta de backup (File System Access API). Cada salvamento gera um arquivo:

`eye-vision-dados_YYYY-MM-DD_HHmmss_XXXXX.json`

- Essa pasta é **independente** do Docker.
- Faça backup dela junto com os volumes Docker.
- Opcional: use `npm run storage:up:bind` para ter também `./data/docker/` no mesmo servidor.

---

## 7. Após reboot do Windows

O script `scripts/storage/after-reboot-setup.ps1` pode subir o Docker e rodar migrate automaticamente. Garanta que o `.env` existe com as senhas corretas antes de agendar a tarefa.

---

## Checklist rápido

- [ ] `.env` criado com senhas fortes
- [ ] `npm run storage:up` ou `storage:up:prod`
- [ ] `npm run storage:migrate`
- [ ] `npm run storage:verify`
- [ ] Pasta local configurada no app
- [ ] Backup periódico: volumes Docker + pasta `eye-vision-dados_*.json`
- [ ] Nunca `docker compose down -v` em produção
