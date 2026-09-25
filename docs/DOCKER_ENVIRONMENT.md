# Ambiente Local de Testes com Redmine 3.4 (Docker)

Este documento descreve como subir um ambiente local do **Redmine 3.4.x** via Docker Compose para desenvolvimento, validação e futuros testes de integração com o addon `@mr-tick/redmine-plugin`.

---

## 1. Visão Geral

O Redmine 3.4.x roda sobre **Ruby on Rails 4.2** e suporta bancos de dados PostgreSQL ou MySQL. Para testes isolados sem afetar o servidor de produção da empresa, recomenda-se a imagem oficial do Redmine `redmine:3.4` pareada com PostgreSQL.

---

## 2. Docker Compose (`docker-compose.yml`)

Crie um arquivo `docker-compose.yml` na raiz ou em um diretório de infraestrutura local:

```yaml
version: '3.8'

services:
  db:
    image: postgres:10-alpine
    restart: always
    environment:
      POSTGRES_DB: redmine
      POSTGRES_USER: redmine
      POSTGRES_PASSWORD: redmine_password
    volumes:
      - redmine_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U redmine"]
      interval: 10s
      timeout: 5s
      retries: 5

  redmine:
    image: redmine:3.4
    restart: always
    depends_on:
      db:
        condition: service_healthy
    ports:
      - '3000:3000'
    environment:
      REDMINE_DB_POSTGRES: db
      REDMINE_DB_DATABASE: redmine
      REDMINE_DB_USERNAME: redmine
      REDMINE_DB_PASSWORD: redmine_password
      REDMINE_SECRET_KEY_BASE: 'f7c8d9e0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8'
    volumes:
      - redmine_files:/usr/src/redmine/files

volumes:
  redmine_pgdata:
  redmine_files:
```

---

## 3. Inicialização do Ambiente

Execute no terminal:

```bash
docker compose up -d
```

Aguarde até que as migrações automáticas do banco sejam concluídas:

```bash
docker compose logs -f redmine
```

Quando o log exibir:
`Listening on 0.0.0.0:3000, CTRL+C to stop`, o servidor estará pronto em `http://localhost:3000`.

---

## 4. Configuração Inicial do Redmine

1. Acesse `http://localhost:3000`.
2. Faça login com as credenciais padrão do Redmine:
   - **Login**: `admin`
   - **Senha**: `admin`
   *(O Redmine solicitará a troca de senha no primeiro acesso; utilize por exemplo `admin123`).*

### Habilitar a API REST (Obrigatório)
A REST API vem desabilitada por padrão no Redmine.
1. Vá em **Administração** (`Administration`) -> **Configurações** (`Settings`).
2. Clique na aba **API** (`API`).
3. Marque a opção:
   - `[x] Ativar serviço web REST` (`Enable REST web service`).
4. Clique em **Salvar**.

### Gerar as Chaves de Acesso (API Key e Atom Key)
1. No canto superior direito, clique em **Minha conta** (`My account` ou `/my/account`).
2. Na barra lateral direita:
   - **Chave de acesso à API**: clique em **Mostrar** (`Show`) ou **Criar** (`Create`). Copie o token hexadecimal (ex: `9b8c7d6e5f4a3b2c1d0e...`).
   - **Chave de acesso ao feed RSS (Atom)**: clique em **Mostrar** ou **Criar**. Copie o token Atom.

---

## 5. Carga de Dados para Testes (Seed)

Para testar o fluxo de tarefas e lançamentos de horas:

1. **Atividades de Apontamento**:
   - Vá em **Administração** -> **Valores enumerados** -> **Atividades (Lançamento de horas)**.
   - Certifique-se de que existam:
     - `Design` (ID padrão: 8)
     - `Desenvolvimento` (ID padrão: 9, definir como padrão)
     - `Gestão` (ID padrão: 10)

2. **Projeto de Teste**:
   - Vá em **Projetos** -> **Novo projeto**.
   - Nome: `Projeto Alpha` (Identificador: `projeto-alpha`).

3. **Criar Chamados (Issues)**:
   - Dentro de `Projeto Alpha`, crie:
     - Issue #1: `Corrigir falha no checkout de pagamentos` (Atribuído a: `admin`).
     - Issue #2: `Implementar dashboard com métricas diárias` (Atribuído a: `admin`).

4. **Lançamento de Horas (Time Entry)**:
   - Lance 2.5 horas na Issue #1 na data de hoje com atividade `Desenvolvimento`.

---

## 6. Testes Rápidos com cURL

Teste a conectividade com a API REST:

```bash
# Validar usuário atual e token
curl -H "X-Redmine-API-Key: SUA_API_KEY" http://localhost:3000/users/current.json

# Validar listagem de tarefas
curl -H "X-Redmine-API-Key: SUA_API_KEY" "http://localhost:3000/issues.json?status_id=*"

# Validar feed Atom
curl "http://localhost:3000/activity.atom?show_issues=1&key=SUA_ATOM_KEY"
```

---

## 7. Próximos Passos (Testes de Integração Automatizados)

Futuramente, pode-se configurar um script `test:integration` no repositório que:
1. Sobe o container Docker do Redmine via script (`docker compose -f docker-compose.test.yml up -d`).
2. Aguarda o endpoint `http://localhost:3000/users/current.json` responder 200 OK.
3. Executa a suíte de testes de integração (`vitest run test/integration`).
4. Derruba o container (`docker compose down -v`).
