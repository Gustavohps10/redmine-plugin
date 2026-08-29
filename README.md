<p align="center">
  <img src="https://raw.githubusercontent.com/Gustavohps10/redmine-plugin/main/src/icon.png" width="96" height="96" alt="Redmine Logo" />
</p>

<h1 align="center">Redmine Plugin para Pandhora</h1>

<p align="center">
  <b>Integração oficial e Fonte de Dados Local-First para gestão de tarefas, apontamento de horas e metadados no Pandhora App.</b>
</p>

<p align="center">
  <a href="https://github.com/gamhora"><img src="https://img.shields.io/badge/Pandhora%20SDK-%3E%3D0.1.0-blue.svg" alt="Pandhora SDK" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Category-DataSource-orange.svg" alt="DataSource" /></a>
  <a href="#"><img src="https://img.shields.io/badge/version-0.1.0-green.svg" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License" /></a>
</p>

<br/>

<p align="center">
  <img src="https://raw.githubusercontent.com/Gustavohps10/redmine-plugin/main/screenshots/screenshot-1.png" width="100%" alt="Interface da Integração Redmine no Pandhora App" />
</p>

<br/>

---

## ⚡ Destaques Rápidos

* 🔄 **Replicação Local-First (RxDB):** Sincronização inteligente e offline-first de tarefas via Atom Feed.
* ⏱️ **Apontamentos com 1 Clique:** Envio de horas trabalhadas direto para os chamados do Redmine com categorização de atividades.
* 📊 **Metadados Automáticos:** Sincroniza status, prioridades com cores, tipos de tarefas e papéis de membros.
* 🚀 **Timerbar & Sidebar:** Atalhos na interface do Pandhora para abrir tarefas no navegador e gerar logs rápidos.
* 🎨 **Tema Clássico:** Visual oficial do Redmine integrado ao modo Claro e Escuro do Pandhora.

---

## 🔑 Configurações do Plugin

Configurado nativamente pela interface do Pandhora App:

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

# Compilar o plugin
yarn build

# Validar manifesto do SDK
yarn pandhora validate ./

# Sincronizar screenshots e links no manifesto
yarn sync:manifest
```

---

## 🚀 Publicação Automática (CI/CD)

Ao criar e enviar uma tag de versão, o GitHub Actions realiza o build, publica a release e notifica o worker `https://addons-manifest.pandhora.workers.dev/`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

<p align="center">
  <sub>Licenciado sob a <a href="LICENSE">MIT License</a>. Feito para o ecossistema Pandhora.</sub>
</p>
