# @timelapse/redmine-plugin

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
