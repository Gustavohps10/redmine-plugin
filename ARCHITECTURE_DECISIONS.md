# Registro de Decisões Arquiteturais (ADR) - Conector Redmine

Este documento consolida as principais decisões de engenharia, arquitetura de rede e estratégias de sincronização adotadas no conector oficial do Redmine para a plataforma **Mr. Tick**. O objetivo é servir como guia técnico definitivo para desenvolvedores que venham a manter ou evoluir este conector no futuro.

Correção de contrato validada em 2026-11-03: respostas de tarefas com `description: null` representam ausência de descrição e são aceitas pelo validador. Ver [evidências de busca por ID e título](docs/2026-11-03-nullable-issue-description-validation.md).

---

## 1. Estratégia de Sincronização: Atom Feed + Batch REST (`issue_id`)

### O Problema
Na API REST nativa do Redmine (`GET /issues.json`), a classe Ruby on Rails `IssueQuery` reúne **todos os filtros com operador lógico `AND`**. O Redmine não suporta nativamente queries com operador `OR` (por exemplo: *"tarefas onde sou autor OU onde sou responsável OU onde participei"*).

Se tentássemos sincronizar tarefas utilizando apenas a API REST padrão:
1. Precisaríamos realizar múltiplas requisições paginadas concorrentes (`assigned_to_id=me`, `author_id=me`, `watcher_id=me`).
2. **Mesmo assim haveria perda de dados**: tarefas nas quais o usuário comentou, fez code review, alterou status ou apontou horas — mas onde não é o autor original nem o responsável atual — **nunca seriam retornadas pela REST API**.
3. O Redmine não possui Webhooks de fábrica. Para obter eventos em tempo real, seria necessário instalar plugins Ruby no servidor do cliente (como `redmine_webhook`), o que é proibitivo em ambientes corporativos por exigências de compliance e permissões de infraestrutura.

### A Solução Adotada (Descoberta via Atom + Enriquecimento em Lote)
Optamos por uma estratégia híbrida em duas fases:

```
┌─────────────────────────────────────────────────────────────┐
│ Fase 1: Descoberta de IDs Relevantes via Feed Atom          │
│ GET /activity.atom?show_issues=1&from=YYYY-MM-DD            │
│ -> Filtra cronologicamente até o checkpoint em memória      │
│ -> Extrai os IDs únicos das tarefas com interação do usuário│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ (Se houver tarefas alteradas)
┌─────────────────────────────────────────────────────────────┐
│ Fase 2: Enriquecimento Cirúrgico em Lote via REST API       │
│ GET /issues.json?issue_id=10,12,45&status_id=*&limit=100    │
│ -> Uma única query indexada por Primary Key no PostgreSQL   │
│ -> Preenche todos os campos ricos (descrição, status, etc.) │
└─────────────────────────────────────────────────────────────┘
```

### Análise de Custo e Performance de Rede
* **Quando não há novas interações desde o último ciclo**:
  * O loop do Atom atinge o checkpoint na **primeira requisição** (~10 KB de XML, processado em < 15ms).
  * Nenhuma chamada adicional à API REST é feita.
  * **Custo total**: 1 requisição HTTP leve.
* **Quando há tarefas alteradas**:
  * O conector faz 1 requisição ao feed Atom e agrupa os IDs únicos.
  * Em seguida, faz **1 única requisição HTTP em lote** via `issue_id=id1,id2,...&status_id=*&limit=100`.
  * **Custo total**: Apenas 2 requisições HTTP por ciclo de sincronização.
  * No servidor Redmine, a busca por múltiplos IDs utiliza o índice de chave primária (`WHERE issues.id IN (...)`), com tempo de resposta quase instantâneo (< 50ms).

---

## 2. Validação Ativa da Atom Key na Autenticação

### O Problema
No `ApplicationController` do Redmine, a resolução do usuário atual (`find_current_user`) funciona da seguinte forma:
```ruby
if params[:format] == 'atom' && params[:key]
  user = User.find_by_rss_key(params[:key])
end
if user.nil? && Setting.rest_api_enabled?
  user = User.find_by_api_key(key) # Autentica via X-Redmine-API-Key
end
```
Se o conector enviar o cabeçalho `X-Redmine-API-Key` durante uma chamada ao feed Atom com uma chave Atom inválida, o Redmine falha na busca da chave Atom, mas **autentica com sucesso pela API Key**. Como resultado, o conector consideraria a chave Atom válida mesmo que o usuário digitasse qualquer valor incorreto ("abobrinha").

### A Solução Adotada
1. No método `validateAtomKey` do `RedmineClient`, sanitizamos o token e validamos o formato alfanumérico.
2. Disparamos a requisição de validação para `/issues/changes.atom?key=${atomKey}` **explicitamente sem o cabeçalho `X-Redmine-API-Key`**.
3. Se a chave for inválida ou não pertencer a nenhum usuário ativo, o Redmine retorna a página HTML de login (`/login`) ou erro HTTP. O conector detecta essa resposta e falha imediatamente na `RedmineAuthenticationStrategy` com mensagem clara: `"Chave de acesso ao feed Atom inválida."`.

---

## 3. Arquitetura Modular por Versão (`datasource/versions/`)

### Estrutura de Diretórios
```
src/datasource/
├── versions/
│   ├── 3.4/           # Implementação canônica baseada na REST API padrão
│   │   ├── RedmineAuthenticationStrategy.ts
│   │   ├── RedmineTaskProvider.ts
│   │   ├── RedmineTimeEntryProvider.ts
│   │   ├── RedmineMemberProvider.ts
│   │   ├── RedmineMetadataProvider.ts
│   │   └── index.ts
│   ├── 5.0/           # Especializações para Redmine 5.x
│   │   └── index.ts
│   ├── 6.0/           # Especializações para Redmine 6.x
│   │   └── index.ts
│   └── index.ts       # Factory getProvidersForVersion
├── RedmineDataSource.ts
└── configFields.ts
```

### Princípios de Design
* **Retrocompatibilidade com Zero Duplicação**: O Redmine mantém consistência em suas rotas REST essenciais (`/issues.json`, `/time_entries.json`, `/users/current.json`). Versões mais recentes estendem ou reutilizam as implementações validadas sem duplicar código.
* **Isolamento de Contratos**: Se uma futura versão do Redmine (ex: 7.x) quebrar um contrato ou adotar uma nova API, apenas a pasta correspondente precisará ser alterada, sem afetar o suporte a clientes em versões legadas (3.4 a 5.x).
* **Modo `auto` Determinístico**: Por padrão, novas instâncias configuradas com `auto` resolvem para a versão mais moderna testada (`6.0`), garantindo suporte retrocompatível transparente para o usuário final.

---

## 4. Matriz de Testes Automatizada com Docker Multi-Versão

### Por que Testar com Docker Real em vez de Mocks?
Mocks em arquivos JSON testam apenas a lógica interna do TypeScript, mas **não pegam bugs reais de protocolo**, tais como:
* Diferenças no parser XML de feeds Atom entre versões do Rails (Rails 4.2 no Redmine 3.4 vs Rails 7.2 no Redmine 6.0).
* Variações de headers de autenticação e redirecionamentos 302 vs 401.
* Compatibilidade de schemas de banco de dados no PostgreSQL real.

### A Matriz de Teste Ativa
O arquivo `docker-compose.test.yml` sobe simultaneamente:
1. **PostgreSQL 10 Alpine**: provisionando bancos independentes (`redmine_34`, `redmine_51`, `redmine_60`).
2. **Redmine 3.4** (Porta `3030`): Stack legada com Ruby 2.4 e Webrick.
3. **Redmine 5.1** (Porta `3051`): Stack intermediária com Ruby 3.1 e Puma.
4. **Redmine 6.0** (Porta `3060`): Stack moderna com Ruby 3.3, Rails 7.2 e Propshaft.
5. **Seed Massivo (`docker/seed.rb`)**: Popula projetos, tarefas em Textile/Markdown, membros e apontamentos de horas reais de forma idempotente em todas as instâncias.

## 5. Analytics independente (Fase 0, 09/11/2026)

O manifesto declara analytics além de auth, dataSource e theme. A ativação registra RedmineAnalyticsSource em contributions.analytics; o provider é criado por conexão autenticada e a contribuição possui limpeza própria. RedmineMetadataProvider mantém apenas os metadados operacionais e mapeamentos.

Catálogo, helpers e datasets vivem em src/analytics. As diferenças de extração e os limites das versões não são inferidos pelo core. Os caches de resolução de nomes são associados ao RedmineClient da conexão. O core obtém opções de filtros pela capacidade analítica, sem consultar metadados pessoais ou adivinhar IDs de datasets.

Nesta fase, os extratores existentes informam coverage: unverified e rejeitam modos/continuações ainda não implementados. Contratos de snapshot, mudanças e agregação remota não constituem suporte implementado de CDC, streaming ou reconciliação. A estratégia Atom + REST em lote acima permanece uma base para a evolução da extração, sujeita à cobertura de cada versão. Os custos de uma ou duas requisições descritos anteriormente não são uma garantia universal do código atual, que também consulta tarefas atribuídas e divide enriquecimento em lotes.

O desenvolvimento usa o SDK local por portal do Yarn. A distribuição exige primeiro a release do SDK com o novo contrato, seguindo Changesets.

## 6. Extração analítica controlada — Fase 1

Os datasets canônicos de tarefas/apontamentos usam JSON (`redmine_issues`, `redmine_time_entries`) e IDs nativos. As extrações CSV anteriores foram retiradas: CSV de apontamentos não tem identidade nativa e exportações de issues podem ter limite de exportação. Não há fallback CSV/JSON silencioso.

Cada chamada REST paginada retorna uma página, metadados de lote e continuação opaca vinculada ao provider, escopo e batch size. Falha conserva a continuação; duplicata, contagem alterada, fim prematuro e metadados inconsistentes são erros. Mesmo 5.1/6.0 não garantem snapshot consistente entre páginas: `batch.finished` encerra o percurso, sem transformar a cobertura em complete. A instabilidade da paginação 3.4 continua explícita e não é mascarada por deduplicação.

Versões/categorias/memberships exigem projeto; journals/relações exigem tarefa. Não há fan-out de projetos/tarefas para construir esses datasets. Filtros usam IDs nativos, custom fields usam chaves custom_field_ID e mantêm providerFieldId; campos ausentes permanecem null. O erro de /users.json é propagado, sem varredura de memberships para disfarçar 403.

O parser Atom é compartilhado com o fluxo pessoal. O dataset de descoberta usa o feed de atividade visível, limitado por feeds_limit, e consulta os IDs de tarefas em lote. Redmine 3.4 aplica a janela histórica de atividade ao feed Atom. Redmine 5.1 e 6.0 retornam o feed limitado sem aplicar essa janela. O addon aplica a seleção de datas aos eventos recebidos. O feed oferece descoberta parcial e não inclui um registro de exclusões.

Orçamento por conexão analítica: uma requisição ativa, fila de oito, timeout de transporte 30s e payload aceito de 2 MiB. O corpo ainda é decodificado antes desse limite: não é streaming nem garantia física de memória. Cada leitura paginada aceita até 100 registros por chamada e até 50 mil identidades; até 16 leituras, com expiração ociosa de 10min. Endpoints nativamente atômicos não ganham paginação fictícia e ficam sujeitos ao limite de payload. O cliente pessoal não compartilha essa fila. InFlightRequests é reutilizado; sua chave agora serializa pares sem colisão por separadores.

A UI é prévia por lote; armazenamento, publicação consistente e reconciliação continuam nas fases seguintes. O perfil opt-in docker/seed-analytics-enterprise.rb acrescenta 12 projetos, 24 usuários, 600 tarefas e 3000 apontamentos, sem apagar o seed base. Comandos: yarn docker:seed:analytics:3.4 / :5.1 / :6.0, ou yarn docker:seed:analytics para a matriz provisionada com os mounts atualizados.

## 7. Atualização incremental e subjanela rolante — Fase 3

A estratégia de atualização passa a declarar exatamente as capacidades comprovadas de cada endpoint nas versões 3.4, 5.1 e 6.0, sem simulações genéricas nem filtros ignorados:

- **`redmine_issues` (`modes: ['snapshot', 'changes']`, `changes: { deletions: 'none' }`):**
  - Snapshots concluídos com ao menos uma linha emitem `checkpoint` igual ao maior `updated_date` ISO observado no servidor (snapshots vazios omitem `checkpoint` até que existam linhas reais do servidor).
  - Consultas incrementais aplicam `updated_on >= checkpoint` normalizado com ordenação determinística `sort=id:asc` e preservam os demais filtros de escopo (`project_id`, `status_id`, `tracker_id`, `assigned_to_id`, `created_on` e interseção de `updated_date_range`). Alteração de `total_count` entre páginas do delta falha explicitamente com `ANALYTICS_COLLECTION_CHANGED`.
  - Como o Redmine não fornece tombstones de exclusão nem eventos para tarefas que saem de filtros (`status_id=o`), `deletions: 'none'` proíbe apagamentos durante `changes` e exige reconciliação completa periódica (`full`) para remover registros excluídos ou fora de escopo.
- **`redmine_time_entries` (`modes: ['snapshot']`, `windowRescan: { dateColumn: 'date' }`):**
  - As versões 3.4, 5.1 e 6.0 ignoram silenciosamente `updated_on`/`created_on` em `/time_entries.json`. Portanto, atualizações rápidas dependem exclusivamente do recorte de subjanela rolante via `spent_on` (`startDate`..`endDate`) coordenado pelo warehouse, com reconciliação periódica da faixa recente e reconciliação completa sob demanda para edições retroativas antigas e exclusões.
  - No Redmine 3.4, intervalos de apontamentos com mais de uma página (`total > batchSize` e `startDate < endDate`) são subdivididos recursivamente por `spent_on` em subintervalos inclusivos sem sobreposição (até o teto de 30 requisições extras), reutilizando a primeira página de cada subintervalo, exigindo soma consistente de `total_count` e preservando validação de identidade global em `scan.seen`. Um único dia com mais de 100 registros no 3.4 continua sujeito à instabilidade de ordenação da API legada e falha explicitamente se repetir IDs.
- **Remoção do filtro legado `date_range` e demais datasets:**
  - `selection: { dateRange, project }` controla o período e o projeto canônicos por dataset, eliminando `{ id: 'date_range' }` de `supportedFilters` e impedindo colisões com subjanela `[windowStart, windowEnd]`. Os demais datasets (`redmine_issue_discovery` incluído) declaram `modes: ['snapshot']` explícito e operam em `full_replace`.

---

## 8. Limites da API Padrão vs. Addons Customizados e Matriz de Cobertura / Alertas

### Por que o addon genérico do Redmine tem teto de assertividade
Este conector foi projetado para funcionar contra **qualquer instalação padrão do Redmine** (3.4, 5.1 e 6.0) sem exigir instalação de plugins Ruby ou extensões no servidor do cliente. Por essa escolha arquitetural:
- **Sem snapshot transacional remoto:** a API REST padrão pagina por `offset`/`limit` sem cursor/snapshot imutável no banco do servidor. Leituras com mais de 1 página ou subdivisão por subfaixas podem sofrer inserções/edições/remoções entre requisições.
- **Sem tombstones de exclusão:** o Redmine padrão não expõe feed nativo de exclusões nem eventos de saída de filtro (`status_id=o`), exigindo reconciliação periódica completa (`full_replace`) ou de janela recente (`window_rescan`) para convergir exclusões.
- **`time_entries` sem filtro por `updated_on`:** atualizações rápidas em apontamentos usam obrigatoriamente `window_rescan` por `spent_on`, e edições retroativas fora da faixa recente só entram em reconciliação completa sob demanda/periódica.

### Extensibilidade para Redmine customizado (Addon Corporativo Interno)
O **core do Mr. Tick** é agnóstico ao provedor e consome exclusivamente o contrato `IAnalyticsProvider` (`@mr-tick/sdk`). Caso uma empresa possua um Redmine modificado com extensões/plugins próprios no servidor Rails (ex.: endpoint com `snapshot_id` consistente, feed de auditoria/exclusões ou regras/datasets internos de negócio):
- É totalmente possível criar um **addon interno dedicado** (ou derivar um conector corporativo) que fale com esses endpoints customizados e emita `coverage: 'complete'`, `changes` com `deletions` reais e agregações/colunas específicas da empresa.
- Nenhuma alteração no core do Mr. Tick é necessária; o aviso de cobertura não confirmada desaparece automaticamente quando o provedor retorna `coverage: 'complete'`.

### Matriz comparativa de cenários, alertas e erros

| Cenário | Classificação | Código / Sinal | Comportamento e Motivo |
| :--- | :--- | :--- | :--- |
| Consulta inteira cabe em **1 única página** (ou resposta atômica) | ✅ Completo (`complete`) | `coverage: 'complete'` | Dados publicados no DuckDB sem aviso; leitura única no servidor. |
| Consulta **multipágina** (`scan.index > 0`) ou **subdivisão por datas** (`splitTimeEntries`) | ⚠️ Aviso (`unverified`) | `coverage: 'unverified'` / `REDMINE_REMOTE_SNAPSHOT_UNAVAILABLE` | **Não é erro.** Os dados são publicados normalmente; a UI avisa com transparência que o Redmine padrão não garante snapshot transacional entre páginas. |
| Redmine **3.4** com `total_count` divergente entre subfaixas (`spent_on`) | ⚠️ Retry limitado → ❌ Erro se persistir | 1 retry automático; `ANALYTICS_COLLECTION_CHANGED` se persistir | Tenta 1 releitura dentro do orçamento de requisições; se a coleção seguir inconsistente, aborta para não publicar dados corrompidos. |
| Alteração de `total_count`, `offset` inesperado ou página vazia com `offset > 0` | ⚠️ Retry limitado → ❌ Erro se persistir | 1 retry automático; `ANALYTICS_COLLECTION_CHANGED` / `ANALYTICS_PAGE_PREMATURE_END` | Proteção contra corrida na paginação sem snapshot; preserva staging anterior válido. |
| Duplicata de ID detectada durante a paginação (`scan.seen`) | ❌ Erro | `ANALYTICS_DUPLICATE_IDENTITY` | Indica instabilidade de ordenação (ex.: >100 registros no mesmo dia no Redmine 3.4); aborta sem mascarar com deduplicação silenciosa. |
| Limite de taxa HTTP **429** com `Retry-After` ou espera de fila > 5s | ⚠️ Adiamento controlado | `HTTP_RATE_LIMIT_DEFERRED` / `Retry-After` | O transporte coordena por origem (respeitando `priority: 'manual'` sem starvation) e exibe o prazo/motivo no diagnóstico sem perder o estado publicado anterior. |
| Exclusões ou edições retroativas antigas fora da janela recente (`time_entries` / `issues`) | ⚠️ Convergência eventual | `deletions: 'none'` / `window_rescan` | Sincronizações rápidas não apagam registros órfãos; é necessário aguardar o ciclo de reconciliação completa (`full`) ou acionar reconciliação manual. |
| Redmine corporativo com plugin próprio de snapshot / CDC implementado em addon interno | ✅ Completo (`complete`) | `coverage: 'complete'` + `changes` | Suportado nativamente pelo contrato `@mr-tick/sdk` sem alterações no core do Mr. Tick. |
