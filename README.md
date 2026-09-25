<p align="center">
  <img src="https://raw.githubusercontent.com/Gustavohps10/redmine-plugin/main/src/icon.png" width="96" height="96" alt="Redmine Logo" />
</p>

<h1 align="center">Redmine Plugin para Mr. Tick</h1>

<p align="center">
  <b>Integração oficial e Fonte de Dados Local-First para gestão de tarefas, apontamento de horas e metadados no Mr. Tick App.</b>
</p>

<p align="center">
  <a href="https://github.com/mr-tick-community"><img src="https://img.shields.io/badge/Mr--Tick%20SDK-%3E%3D0.4.0-blue.svg" alt="Mr-Tick SDK" /></a>
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

Consulte a documentação completa de configuração do Redmine 3.4 com Docker em:
[docs/DOCKER_ENVIRONMENT.md](docs/DOCKER_ENVIRONMENT.md)

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
