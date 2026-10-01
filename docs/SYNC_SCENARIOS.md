# Cenários de Sincronização, Limitações e Casos de Borda - Conector Redmine

Este documento detalha o comportamento do conector oficial do Redmine para o **Mr. Tick**, descrevendo passo a passo os cenários que funcionam com 100% de sucesso, os cenários de falha decorrentes de restrições do próprio Redmine e as soluções recomendadas de engenharia.

---

## 1. Visão Geral da Arquitetura Híbrida

O conector adota uma estratégia híbrida composta por dois pilares:
1. **REST API Paginada e Indexada**:
   - `GET /issues.json?assigned_to_id=<id>&status_id=*&limit=100`: Traz tarefas atribuídas diretamente ao usuário (abertas ou fechadas).
   - `GET /time_entries.json?user_id=<id>&from=<data>&to=<data>`: Puxa o histórico de lançamentos de horas do usuário.
2. **Feed Atom de Eventos Recentes**:
   - `GET /activity.atom?key=<atomKey>&show_issues=1&show_time_entries=1`: Monitora os eventos mais recentes da instância para pescar tarefas onde o usuário interagiu (comentou, alterou status ou apontou horas) sem ser o responsável direto.
   - `GET /issues.json?issue_id=<ids>`: Enriquecimento cirúrgico em lote para tarefas descobertas no Atom.

---

## 2. Cenários que Funcionam 100% (Passo a Passo)

### Cenário 1: Tarefas Atribuídas ao Usuário (Novas ou Antigas)
* **Situação**: O usuário possui tarefas sob sua responsabilidade (como a tarefa `#1`), criadas hoje ou há meses.
* **Passo a Passo**:
  1. Durante a replicação de tarefas (`tasks.pull`), o conector dispara `pullViaRest` filtrando `assigned_to_id=<user_id>&status_id=*`.
  2. O banco de dados do Redmine responde instantaneamente utilizando o índice de chave estrangeira.
  3. O conector mapeia os registros com título completo (`subject`), tracker, prioridade, status e datas.
  4. O RxDB local armazena os documentos no cache.
  5. Ao abrir a tabela de apontamentos, qualquer lançamento vinculado a essas tarefas exibe imediatamente `#ID - Título da Tarefa`.
* **Resultado**: **Sucesso Total**. Não depende do feed Atom e não é afetado pelo limite de 15 eventos.

---

### Cenário 2: Tarefas de Terceiros com Interação Recente (Descoberta via Atom)
* **Situação**: Uma tarefa `#45` está atribuída a outro membro da equipe, mas você comentou nela ou fez um apontamento de horas recentemente.
* **Passo a Passo**:
  1. O conector consulta o feed `/activity.atom` com as credenciais do usuário.
  2. O Redmine inclui a atividade recente nos 15 eventos do feed.
  3. O `NativeAtomParser` extrai o ID da tarefa `#45` e o `AtomTaskMatcher` valida que houve menção/interação do seu usuário.
  4. O conector agrupa esses IDs e faz uma chamada em lote: `GET /issues.json?issue_id=45&status_id=*`.
  5. A tarefa é enriquecida com todos os campos e salva no RxDB local.
* **Resultado**: **Sucesso Total**. Tarefas de outros colegas aparecem no seu radar sem precisar varrer todo o Redmine.

---

### Cenário 3: Validação Estrita de Autenticação da Atom Key
* **Situação**: O usuário informa uma chave de feed Atom inválida ("abobrinha" ou token aleatório inexistente).
* **Passo a Passo**:
  1. No momento de salvar a conexão ou testar credenciais, o conector chama `validateAtomKey`.
  2. Dispara uma requisição para `/issues/changes.atom?key=<chave>` explicitamente sem cabeçalhos de API Key.
  3. Se a chave for inválida:
     - No Redmine 3.4: O servidor responde com redirecionamento `302 Found` para `/login`.
     - No Redmine 5.x / 6.x: O servidor Rails instancia `AnonymousUser`, cujo `atom_key` é `nil`. O template XML omite o parâmetro `key` do link canônico `<link rel="self" href=".../issues/changes.atom"/>`.
  4. O conector detecta a ausência de `key=<chave>` ou a presença de página de login e rejeita imediatamente com `Chave de acesso ao feed Atom inválida.`.
* **Resultado**: **Sucesso Total**. Nenhuma credencial falsa ou incorreta consegue ser cadastrada.

---

### Cenário 4: Seleção Manual de Tarefas no Seletor da UI (`TaskLookup`)
* **Situação**: O usuário precisa iniciar um apontamento em uma tarefa que não estava no seu cache local.
* **Passo a Passo**:
  1. No modal de criação ou na linha da tabela, o usuário clica em *"Escolher tarefa"* e digita o ID (ex: `#102`) ou parte do título.
  2. O componente de busca remota consulta o Redmine via `findById` ou `listIssues`.
  3. A tarefa é retornada pela API, exibida no dropdown e gravada no banco local no momento da seleção.
* **Resultado**: **Sucesso Total**. Qualquer tarefa existente na qual o usuário tenha permissão pode ser selecionada.

---

## 3. Cenários de Falha / Limitações do Redmine (Passo a Passo)

### Limitação 1: Apontamento Histórico em Tarefa de Terceiro Fora do Feed Atom
* **O Problema**:
  - Você apontou horas há 3 semanas na tarefa `#88` (atribuída a outro desenvolvedor).
  - De lá para cá, o time gerou dezenas de novos eventos no Redmine.
  - Você instala o Mr. Tick em um computador novo ou realiza uma limpeza de cache.
* **Passo a Passo da Falha**:
  1. O conector sincroniza os apontamentos (`timeEntries.pull`): ele busca `/time_entries.json?user_id=me` e baixa o apontamento com `taskId: "88"`.
  2. O conector sincroniza as tarefas (`tasks.pull`):
     - A REST API (`assigned_to_id=me`) **não traz** a `#88` (porque ela está atribuída a outra pessoa).
     - O feed Atom (`/activity.atom`) **não traz** a `#88` (porque o Redmine trava em 15 eventos e a `#88` já caiu para trás no tempo).
  3. O RxDB local fica com o apontamento registrado, mas a tabela de tarefas não possui a `#88`.
  4. **Sintoma na UI**: A tabela de apontamentos exibe apenas o badge cinza `#88` sem o título ao lado.
* **Causa Raiz Técnica**:
  - A API REST do Redmine não suporta queries com operador `OR` (`assigned_to_id=me OR time_entries.user_id=me`).
  - O endpoint de apontamentos (`/time_entries.json`) devolve apenas `{ "issue": { "id": 88 } }` sem o título do chamado.
* **Solução Recomendada de Engenharia (Lazy Resolver)**:
  - Implementar um resolvedor sob demanda na interface/store: quando uma linha de time entry contiver um `taskId` que não existe no RxDB de tarefas, o sistema dispara em segundo plano uma busca pontual `GET /issues/88.json` e persiste a tarefa no banco local, preenchendo o título de forma automática e transparente.

---

### Limitação 2: Tarefas Genéricas / Não Atribuídas a Ninguém (ex: Sprint Scrum, Reuniões, Infra)
* **O Problema**:
  - Projetos ágeis costumam ter tarefas guarda-chuva para a sprint (ex: `#354 - Sprint 24 - Atividades Gerais`), que não ficam atribuídas a nenhum dev específico (`assigned_to_id = null`).
  - O desenvolvedor abre o app pela manhã para começar o dia e quer ver essa tarefa pronta no seletor, antes de ter feito qualquer apontamento nela.
* **Passo a Passo da Falha**:
  1. O conector executa a sincronização de tarefas.
  2. Como a tarefa `#354` não tem responsável e não teve evento nos últimos 15 itens do Atom, ela não é puxada na sincronização inicial.
  3. O usuário abre o seletor de tarefas esperando vê-la listada automaticamente na lista padrão, mas ela não está lá.
* **Por que o Conector Não Baixa Automaticamente?**:
  - Em empresas com milhares de tarefas, buscar todas as tarefas sem responsável (`assigned_to_id=!*`) traria centenas de chamados irrelevantes de outros departamentos, estourando limites de rede e degradando a experiência do usuário.
* **Como o Usuário Contorna Hoje**:
  - O dev clica no campo de tarefa, digita `#354` e pressiona Enter. A busca remota localiza a tarefa e a inclui no cache local.
* **Solução Recomendada de Engenharia para o Roadmap (Pinned Tasks / IDs Fixados)**:
  - Criar um campo nas configurações da conexão: *"IDs de Tarefas Fixadas / Frequentes"* (ex: `354, 12, 8`).
  - Durante o `tasks.pull`, o conector inclui esses IDs na query de lote (`/issues.json?issue_id=354,12,8`), garantindo que essas tarefas estejam sempre presentes no banco local e destacadas no topo da lista.

---

### Limitação 3: Apontamentos Diretamente no Projeto (Sem Tarefa)
* **O Problema**:
  - O Redmine permite registrar horas diretamente em um Projeto sem vincular a nenhuma Issue específica.
* **Passo a Passo do Comportamento**:
  1. No `/time_entries.json`, a chave `issue` vem nula, vindo preenchido apenas `project: { "id": 10, "name": "Portal do Cliente" }`.
  2. O conector mapeia `taskId = project.id`.
  3. Como o ID pertence a um Projeto e não a uma Tarefa, a busca por tarefa não localiza nada.
* **Sintoma na UI**:
  - O apontamento aparece como *"Sem tarefa"*, exibindo apenas o nome do projeto no agrupamento.
* **Tratamento Adequado**:
  - O conector e a interface devem tratar apontamentos sem issue explicitamente com `taskId: null`, populando apenas o metadado de projeto para evitar confusão entre IDs de projeto e IDs de chamado.

---

## 4. Matriz Comparativa de Cobertura

| Cenário de Negócio | Status Atual | Mecanismo Utilizado | Ação Necessária |
| :--- | :---: | :--- | :--- |
| Tarefa atribuída ao usuário (ex: `#1`) | **100% Funcional** | REST API (`assigned_to_id`) | Nenhuma (Automático) |
| Tarefa de colega com interação recente | **100% Funcional** | Feed Atom + Enriquecimento em Lote | Nenhuma (Automático) |
| Digitação manual de qualquer ID no seletor | **100% Funcional** | REST API (`getIssueById`) | Nenhuma (Automático) |
| Autenticação com chave Atom falsa | **100% Bloqueado** | `/issues/changes.atom` Self-Link | Nenhuma (Segurança Ativa) |
| Apontamento antigo em tarefa de terceiros | **Badge sem Título** | Requer Lazy Resolver | Implementar Lazy Resolver |
| Tarefa sem responsável antes do primeiro uso | **Requer Busca** | Busca Remota sob demanda | Digitar ID ou Pinned Tasks |
| Apontamento sem tarefa (apenas projeto) | **Tratado como Projeto**| Fallback de Projeto | Manter como sem tarefa |
