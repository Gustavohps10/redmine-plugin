---
'@mr-tick/redmine-plugin': patch
---

Aceita `description: null` nas respostas de tarefas do Redmine, representando ausência de descrição. Corrige `HTTP_RESPONSE_INVALID` na busca por ID e em páginas de pesquisa que contenham essas tarefas, preservando a rejeição de tipos inválidos.

Atualiza os seletores de configuração para `source.kind: static` e mantém o SDK via portal local durante o desenvolvimento, sem exigir sua publicação.
