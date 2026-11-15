# Limitações da API REST do Redmine em Extrações Analíticas

Este documento registra limitações estruturais da API REST oficial do Redmine que podem gerar diferenças entre dashboards extraídos via API e relatórios gerados diretamente sobre o banco de dados do servidor Redmine.

---

## 1. Controle de acesso por projeto e papel (ACLs da API Key)

A API REST do Redmine (`/time_entries.json`, `/issues.json`, `/projects.json`, `/memberships.json`) aplica estritamente as permissões da conta associada à chave de API utilizada:

- **Projetos privados ou restritos**: apontamentos lançados em projetos onde a conta autenticada não é membro — ou cujo papel não possui a permissão **Ver tempo gasto (`view_time_entries`)** — são omitidos silenciosamente das respostas de `/time_entries.json`.
- **Projetos arquivados**: registros vinculados a projetos arquivados não aparecem nas listagens padrão da API REST.
- **Endpoints administrativos (`HTTP 403`)**: contas sem privilégio de administrador podem receber `HTTP 403` em recursos como listagem global de membros/usuários (`members`), sem impedir a extração dos apontamentos visíveis ao usuário.

**Impacto prático:** colaboradores que atuaram em projetos restritos podem apresentar soma de horas menor via API do que em relatórios internos que consultam diretamente o SQL do Redmine sem filtro de usuário.

**Mitigação recomendada:** para dashboards gerenciais de toda a organização, utilizar uma API key de conta com visibilidade global (ou papel de leitura de tempo gasto em todos os projetos ativos relevantes).

---

## 2. Arredondamento decimal de `hours`

O campo `hours` retornado em `/time_entries.json` é serializado pela API do Redmine como número decimal em ponto flutuante por lançamento.

**Impacto prático:** ao somar dezenas de lançamentos fracionados (ex.: minutos convertidos em fração decimal), podem ocorrer variações residuais de **`±0.01h` a `±0.02h`** em comparação a agregações executadas diretamente no banco de dados com tipos numéricos exatos (`DECIMAL`/`NUMERIC`).

---

## 3. Cuidado com `GROUP BY` em transformações SQL sobre `time_entries`

Cada linha de `/time_entries.json` representa um lançamento individual (`id` único).

- **Armadilha comum:** escrever consultas como `SELECT user, activity, hours FROM apontamentos GROUP BY user, activity, hours` faz com que lançamentos distintos com a **mesma duração** (ex.: múltiplos apontamentos de `1.00h` na mesma atividade) sejam colapsados em uma única linha, subestimando drasticamente o total de horas.
- **Forma correta:** sempre agregar explicitamente com `SUM(hours)` (`SELECT user, activity, SUM(hours) AS hours FROM apontamentos GROUP BY user, activity`) ou manter os registros sem `GROUP BY` para que a camada de visualização realize a soma.
