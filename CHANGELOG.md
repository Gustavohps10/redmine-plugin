# @timelapse/redmine-plugin

## 0.7.1

### Patch Changes

- 10cfa2c: Expor suporte oficial a Temas (theme e tema) nas categorias e tags do manifesto do Redmine Plugin.

## 0.7.0

### Minor Changes

- 184c78a: Adopt the required SDK snapshot page contract for time-entry pulls. Revisit changes to existing entries even when Redmine returns the same updated_on timestamp, using complete validated snapshots and stateless cursors. This release requires the updated SDK and host contract; no branch for the previous pull format remains.

  Represent project-only entries with no issue association. Preserve that association when editing hours or comments, and reject creation without an explicit issue before making an HTTP write.

### Patch Changes

- 184c78a: Return Redmine's canonical stored state after time-entry creation and confirm updates by their ID immediately after a successful PUT. Read updated canonical state separately through findById so the core can retain confirmed writes and retry only GET after read failures. Reconcile lost create responses by the exact correlation marker, filtering the original user, issue and date window with pagination. Validate the complete comment length before writing and preserve remote HTTP errors. Creation orchestration belongs to the core so the provider does not repeat correlation lookups.

  Read complete paginated time-entry snapshots before filtering and sorting by the pull cursor. Reject inconsistent pages instead of acknowledging partial listings. Cover remote ordering, timestamp ties, updates beyond the third page and transient/inconsistent pages through connector E2E tests over loopback HTTP. The standard Redmine API does not implement the SDK optional atomic conditional update guarantee.

  Require complete validated snapshots for correlation recovery as well as ordinary pulls. Never conclude absence or uniqueness from a truncated, duplicated or inconsistent page; retain original failures and reject ambiguous correlation matches before remote writes.

## 0.6.0

### Minor Changes

- 5c44356: Adiciona suporte a busca de tarefas por lote de IDs e termo de pesquisa no método findAll, e amplia a janela de histórico para enriquecimento de tarefas com apontamentos recentes.

### Patch Changes

- 3b98479: Otimiza sincronização de tarefas e apontamentos eliminando overhead de requisições no Atom, limitando paginação de time entries e incorporando com cache tarefas onde o usuário apontou horas recentemente (suporte/revisão) para garantir exibição de título e metadados.

## 0.5.2

### Patch Changes

- 1310a65: Corrigir validação de chave Atom via verificação de self-link em /issues/changes.atom e unificar sincronização REST com descoberta de tarefas no feed Atom

## 0.5.1

### Patch Changes

- 9fb248b: fix(schema): remove campo metadataMappings do getConnectionSchema

  O campo `metadataMappings` (type: 'mapping') foi removido do schema de conexão inicial
  pois custom fields e metadados do Redmine só podem ser descobertos após autenticação
  via API REST. O mapeamento agora é configurado pós-conexão diretamente no painel de
  instâncias da conexão ativa.

## 0.5.0

### Minor Changes

- a414011: feat: desacopla custom fields com descoberta dinâmica a partir de issues sem dependência de privilégios de admin, adiciona suporte a getMappingFields e atualiza @mr-tick/sdk para ^0.5.0
- 642b996: refactor: substitui tabelas estáticas de IDs numéricos por resolução semântica dinâmica de metadados (atividades e status) e adiciona medição de latência real de rede no teste de conexão

## 0.4.1

### Patch Changes

- 5c260d2: Torna a validação da chave do feed Atom estritamente obrigatória na autenticação, rejeitando chaves vazias ou inválidas.

## 0.4.0

### Minor Changes

- a6ae6d9: Adiciona validação ativa da Atom Key na estratégia de autenticação e enriquecimento completo de tarefas via REST API (por lista de IDs) na sincronização incremental.

## 0.3.0

### Minor Changes

- f662bf3: Adiciona suporte multi-versão ao Redmine (3.4, 5.0 e 6.0), organização modular de pastas em datasource/versions, matriz de testes de integração com Docker e pipeline de CI/CD automatizada no GitHub Actions.

## 0.2.0

### Minor Changes

- efbe45d: Modernização da arquitetura do conector Redmine para alinhamento com @mr-tick/sdk >= 0.4.0, configuração de suíte de testes unitários com Vitest e documentação do ambiente Docker para Redmine 3.4.

## 1.0.1

### Patch Changes

- Update SDK compatibility

## 1.0.0

### Major Changes

- dddd2ee: Initial Release
