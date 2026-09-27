---
'@mr-tick/redmine-plugin': patch
---

fix(schema): remove campo metadataMappings do getConnectionSchema

O campo `metadataMappings` (type: 'mapping') foi removido do schema de conexão inicial
pois custom fields e metadados do Redmine só podem ser descobertos após autenticação
via API REST. O mapeamento agora é configurado pós-conexão diretamente no painel de
instâncias da conexão ativa.
