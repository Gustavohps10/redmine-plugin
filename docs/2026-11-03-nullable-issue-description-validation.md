# Busca de tarefa com descrição nula

Data: 2026-11-03.

## Causa confirmada

A leitura real de `/issues/76314.json` retornava JSON de sucesso com `issue.description: null`. O validador `isRedmineIssueAPI` aceitava apenas texto ou campo ausente; o transporte rejeitava esse payload com `HTTP_RESPONSE_INVALID`. A falha era no contrato do conector, não na digitação ou no ID informado.

Para identificar o campo, a instrumentação temporária do transporte registrou somente estrutura e tipos dos campos, sem seus valores. Ela foi removida após a investigação. Não foram feitas escritas no servidor Redmine.

## Correção

`RedmineIssueAPI.description` aceita `string | null` quando presente. O validador aceita `null` explicitamente; o mapper já representa ausência de descrição como `undefined` no TaskDTO. A mesma validação cobre respostas individuais e itens de páginas de busca. Tipos inválidos, como descrição numérica, continuam sendo rejeitados.

## Evidências

- E2E de contrato com HTTP real em loopback: servidor Node → FetchHttpClient do SDK (exportado no projeto como AxiosHttpClient) → RedmineClient → RedmineTaskProvider. Antes da correção, dois cenários falharam pelo comportamento esperado: ID com descrição nula e página de pesquisa com descrição nula. Os outros quatro passaram.
- Depois da correção: seis cenários aprovados, incluindo descrição textual, vazia, ausente e rejeição de descrição numérica. Teste: `test/e2e/TaskLookupDescription.e2e.spec.ts`.
- Suíte completa sem Docker: 17 arquivos, 97 testes aprovados (`yarn test`). `yarn tsc --noEmit` e `yarn build` na raiz do addon terminaram com sucesso.
- Verificações globais na raiz de metric: `yarn typecheck`, 15/15 trabalhos aprovados; `yarn lint:fix`, zero erros e 108 avisos.
- Limitação de tooling: o addon não define scripts `typecheck` ou `lint:fix`; a execução desses nomes confirmou sua ausência. A checagem de tipos do addon foi executada diretamente com `yarn tsc --noEmit`. O lint global de metric não é apresentado como cobertura de lint do repositório externo do addon.
- Pacote local gerado pelo CLI oficial do SDK e importado pelo IPC normal de instalação, sem publicação. O manifesto de desenvolvimento foi preservado, e nenhuma versão foi alterada manualmente. Após recarregar o processo dev, a chamada pelo IPC de tarefas do Electron retornou `isSuccess: true`, tarefa `76314`, sem descrição. Evidência local em `metric/.temp/task-lookup-redmine-real-green.log`.

Logs de testes do addon: `.task-lookup-description-red.log`, `.task-lookup-description-green.log`, `.task-lookup-description-tests.log`, `.task-lookup-description-typecheck.log`, `.task-lookup-description-build.log`. São artefatos locais ignorados pelo Git.

Revisão independente aprovada por `tech_lead_lookup_final`: confirmou semântica da ausência de descrição, rejeição de tipos inválidos, cobertura HTTP real em loopback e sucesso da tarefa `76314` no Electron. Sem bloqueadores concretos identificados no ajuste.
