# Ambiente Local Multi-Versão do Redmine (Docker Matrix: 3.4, 5.1, 6.0)

Este documento descreve a arquitetura do ambiente de testes multi-versão do **Redmine (3.4, 5.1 e 6.0)** via Docker Compose, permitindo desenvolvimento, validação e execução da matriz automatizada de testes de integração do addon `@mr-tick/redmine-plugin`.

---

## 1. Visão Geral da Matriz

O Redmine evoluiu de versões legadas com Rails 4.2 até a geração atual com Rails 7.2. Para garantir compatibilidade ponta a ponta sem surpresas para clientes em qualquer estágio:

- **Redmine 3.4.x** (porta `3030`): Piso legado corporativo (Rails 4.2 / Ruby 2.4).
- **Redmine 5.1.x** (porta `3051`): Padrão de mercado atual (Rails 6.1 / Ruby 3.2).
- **Redmine 6.0.x** (porta `3060`): Última versão estável lançada (Rails 7.2 / Ruby 3.3).
- **PostgreSQL 10 Multi-Database**: Bancos isolados (`redmine_34`, `redmine_51` e `redmine_60`) criados via `docker/init-multi-db.sh`, garantindo que migrações de schema não interfiram entre si.

---

## 2. Arquitetura Modular de Código (`src/`)

```
src/
├── client/
│   ├── RedmineClient.ts          # Cliente HTTP REST, parser de Atom e tolerância a URLs
│   └── index.ts
├── datasource/
│   ├── versions/                 # Implementações encapsuladas no domínio do datasource
│   │   ├── 3.4/
│   │   │   ├── RedmineAuthenticationStrategy.ts
│   │   │   ├── RedmineMemberProvider.ts
│   │   │   ├── RedmineMetadataProvider.ts
│   │   │   ├── RedmineTaskProvider.ts
│   │   │   ├── RedmineTimeEntryProvider.ts
│   │   │   └── index.ts
│   │   ├── 5.0/
│   │   │   └── index.ts          # Reexporta 3.4 com zero duplicação de código
│   │   └── index.ts              # Factory de resolução por versão
│   ├── configFields.ts           # Definição de abas e seletor de versão (auto, 3.4, 5.0, 6.0)
│   ├── RedmineDataSource.ts      # Orquestrador do DataSource
│   └── index.ts
├── theme/
│   ├── redmine.css               # Folha de estilo clássica do Redmine
│   ├── redmineCss.ts             # Constante REDMINE_CSS
│   └── index.ts
├── types/
│   └── redmine.ts                # DTOs da API
├── icon.png                      # Asset oficial
└── index.ts                      # Entrypoint limpo do addon
```

### Zero Duplicação de Código Comprovada
Após a execução dos testes reais com 100% de cobertura contra os três containers, foi comprovado que a REST API e o feed Atom mantiveram total retrocompatibilidade no Redmine 5.1 e no Redmine 6.0. A arquitetura modular permite reutilizar as implementações consolidadas sem duplicar código, mantendo o conector pronto para receber especializações caso futuras versões exijam endpoints diferentes.

---

## 3. Inicialização e Seed Automático

```bash
# 1. Sobe todos os containers da matriz (Redmine 3.4, 5.1 e 6.0)
yarn docker:up

# 2. Executa o seed massivo de 1 mês em todas as 3 instâncias
yarn docker:seed

# Ou individualmente:
yarn docker:seed:3.4
yarn docker:seed:5.1
yarn docker:seed:6.0
```

---

## 4. Usuários e Credenciais de Teste

Todas as instâncias (`3030`, `3051` e `3060`) contam com a mesma massa pré-configurada:

| Usuário | Nome | Papel | Senha | API Key | Atom Key |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `admin` | Redmine Admin | Administrador | `admin123` | `testapikeyredmine1234567890abcdef` | `testatomkeyredmine1234567890abcdef` |
| `carlos.dev` | Carlos Silva | Desenvolvedor | `admin123` | `carlosapikeyredmine1234567890abcdef` | `carlosatomkeyredmine1234567890abcdef` |
| `mariana.pm` | Mariana Souza | Gerente de Projetos | `admin123` | `marianaapikeyredmine1234567890abcdef` | `marianaatomkeyredmine1234567890abcdef` |
| `beatriz.qa` | Beatriz Ramos | Analista de QA | `admin123` | `beatrizapikeyredmine1234567890abcdef` | `beatrizatomkeyredmine1234567890abcdef` |

---

## 5. Massa de Dados (Seed Massivo)

- **4 Projetos Corporativos**: `test-project`, `core-api`, `desktop-app`, `customer-portal`.
- **47 Tarefas Realistas** distribuídas pelo último mês em diferentes status e prioridades.
- **Especificação Técnica em Textile**: Issue #2 estruturada com tabelas e código TypeScript.
- **176+ Apontamentos de Horas**: Distribuídos nos dias úteis dos últimos 35 dias para todos os membros.

---

## 6. Execução de Testes

```bash
# Executa apenas testes unitários rápidos (offline)
yarn test

# Executa matriz completa contra Redmine 3.4, Redmine 5.1 e Redmine 6.0
yarn test:integration

# Executa todos os testes (unitários + matriz de integração tripla)
yarn test:all

# Derruba os containers e limpa os volumes
yarn docker:down
```
