<p align="center">
  <img src="https://raw.githubusercontent.com/Gustavohps10/redmine-plugin/main/src/icon.png" width="96" height="96" alt="Redmine Logo" />
</p>

<h1 align="center">Redmine Plugin para Mr. Tick</h1>

<p align="center">
  <b>Integração oficial e Fonte de Dados Local-First para gestão de tarefas, apontamento de horas e metadados no Mr. Tick App.</b>
</p>

<p align="center">
  <a href="https://github.com/mistertick"><img src="https://img.shields.io/badge/Mr--Tick%20SDK-%3E%3D0.4.0-blue.svg" alt="Mr-Tick SDK" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Category-DataSource-orange.svg" alt="DataSource" /></a>
  <a href="#"><img src="https://img.shields.io/badge/version-0.2.0-green.svg" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License" /></a>
</p>

<br/>

<p align="center">
  <img src="https://raw.githubusercontent.com/Gustavohps10/redmine-plugin/main/screenshots/screenshot-1.png" width="100%" alt="Interface da Integração Redmine no Mr. Tick App" />
</p>

<br/>

---

## ⚡ Destaques Rápidos

* 🔄 **Replicação Local-First (RxDB):** Sincronização inteligente e offline-first de tarefas via Atom Feed ou REST API.
* ⏱️ **Apontamentos com 1 Clique:** Envio de horas trabalhadas direto para os chamados do Redmine com categorização de atividades e cálculo preciso UTC.
* 📊 **Metadados Automáticos:** Sincroniza status, prioridades com cores, tipos de tarefas e papéis de membros.
* 🚀 **Timerbar & Sidebar:** Atalhos na interface do Mr. Tick para abrir tarefas no navegador e gerenciar apontamentos.
* 🎨 **Tema Clássico:** Visual oficial do Redmine integrado ao modo Claro e Escuro do Mr. Tick.

---

## Idempotência de Apontamentos

Apontamentos enviados pelo Mr. Tick levam um marcador de correlação (`[mc:<UUID>]`) no campo de comentários do Redmine. O plugin usa esse marcador para localizar uma criação cuja resposta se perdeu e remove o marcador dos comentários exibidos no Mr. Tick. O marcador pode ser visto por quem consultar o comentário diretamente no Redmine.

O core coordena as consultas de correlação; o create do addon faz somente o POST. Falhas transitórias de consulta são repetidas pelo mecanismo de sincronização. Se uma consulta bem-sucedida não encontrar a criação tentada, ou encontrar mais de um registro, o Mr. Tick bloqueia novos POSTs automáticos. Antes de autorizar uma nova criação, confira manualmente se o apontamento já existe no Redmine; uma nova criação autorizada ainda pode duplicar o registro se o original existir, mas não puder ser localizado.

---

O create retorna o registro recebido do Redmine; após PUT confirmado, o addon retorna o ID e o core consulta o estado canônico. Se essa leitura falhar, a recuperação repete somente GET, preservando a edição sem repetir PUT. Horas, comentários e timestamps confirmados pelo servidor substituem os valores locais. A busca usa usuário, tarefa e a data original da tentativa, com paginação e janela de um dia para cada lado. O limite de comentários inclui o marcador e é validado antes da requisição.

Para testar o contrato ainda não publicado, compile o SDK no monorepo e execute `yarn link ../metric/src/apps/sdk --relative` neste repositório. Esse vínculo altera package.json e yarn.lock apenas para desenvolvimento; não deve ser publicado no addon. A publicação do addon depende da publicação prévia do changeset do SDK e de consumir essa versão pelo fluxo normal de dependências.

O pull de apontamentos agora usa obrigatoriamente o contrato de páginas do SDK: `items`, `checkpoint`, `hasMore` e `snapshotId`. O cursor do snapshot detecta mudanças de conteúdo mesmo quando `updated_on` não muda; snapshots incompletos continuam rejeitados. Não há caminho de compatibilidade com o formato anterior de arrays. Apontamentos vinculados apenas a um projeto mantêm a tarefa ausente, sem converter o ID do projeto em ID de issue.

Antes de publicar esta minor do addon, publique a minor do SDK prevista no changeset, atualize a dependência e o lockfile para essa versão publicada e execute testes/build com uma instalação limpa. O empacotamento pelo CLI desse SDK define a nova `requiredApiVersion`. A dependência atual `^0.5.0` e o manifesto existente pertencem à release anterior; o build local com SDK vinculado não comprova instalação limpa dessa release futura.

## 🔑 Configurações do Plugin

Configurado nativamente pela interface do Mr. Tick App:

```text
┌───────────────────────────────┬────────────────────────────────────────────────────────┐
│ Campo                         │ O que preencher?                                       │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ URL da Instância              │ Ex: https://redmine.suaempresa.com                     │
│ Chave de Acesso à API (REST)  │ Obtenha em: Minha Conta -> Chave de acesso à API       │
│ Chave do Atom (RSS)           │ Obtenha em: Minha Conta -> Chave de acesso Atom        │
└───────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 🛠️ Comandos de Desenvolvimento

```bash
# Instalar dependências
yarn install

# Executar testes unitários com Vitest
yarn test

# Compilar o plugin
yarn build

# Validar manifesto do SDK
yarn manifest

# Sincronizar screenshots e links no manifesto
yarn sync
```

---

## 🐳 Ambiente Docker para Testes

Consulte a documentação completa de configuração da matriz multi-versão do Redmine (3.4, 5.1 e 6.0) com Docker em:
[docs/DOCKER_ENVIRONMENT.md](docs/DOCKER_ENVIRONMENT.md)

---

## 🏛️ Decisões de Arquitetura e Engenharia

Para entender em detalhes a estratégia de sincronização híbrida (Atom Feed + REST API em batch), a validação ativa da Atom Key e o design multi-versão, consulte:
* [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) - Decisões arquiteturais fundamentais.
* [docs/SYNC_SCENARIOS.md](docs/SYNC_SCENARIOS.md) - Análise exaustiva de cenários que funcionam, casos de borda e limitações conhecidas.

---

## 🚀 Publicação Automática (CI/CD)

Ao criar e enviar uma tag de versão, o GitHub Actions realiza o build, publica a release e notifica o worker `https://addons-manifest.mistertick.workers.dev/`:

```bash
git tag v0.2.0
git push origin v0.2.0
```

---

<p align="center">
  <sub>Licenciado sob a <a href="LICENSE">MIT License</a>. Feito para o ecossistema Mr. Tick.</sub>
</p>
