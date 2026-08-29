import { AddonContext, AddonSettingsSchema, IAddon } from '@pandhora/sdk'

import { redmineSettingsSchema } from './configFields.js'
import { REDMINE_CSS } from './redmineCss.js'
import { RedmineDataSource } from './RedmineDataSource.js'

export default class RedmineAddon implements IAddon {
  public metadata = {
    name: 'Redmine',
    iconUrl:
      'https://raw.githubusercontent.com/Gustavohps10/redmine-plugin/main/src/icon.png',
  }
  private dataSource = new RedmineDataSource()
  private activeContext: AddonContext | null = null

  async getSettingsSchema(): Promise<AddonSettingsSchema> {
    return redmineSettingsSchema
  }

  activate(context: AddonContext): void {
    this.activeContext = context

    // 1. Registra capacidade de DataSource
    context.dataSources.register(this.dataSource)

    // 2. Registra Menus na Sidebar (Itens e Subitens de navegação)
    context.menus.sidebar.register({
      id: 'redmine-sidebar',
      label: 'Redmine',
      icon: 'Layers',
      children: [
        {
          id: 'redmine-issues',
          label: 'Minhas Tarefas',
          href: '/addons/redmine/issues',
          icon: 'ListTodo',
        },
        {
          id: 'redmine-projects',
          label: 'Projetos',
          href: '/addons/redmine/projects',
          icon: 'FolderGit2',
        },
      ],
    })

    // 3. Registra 1 único item de Popover na Timerbar (usando ícone PNG do Redmine)
    context.menus.timerbar.register({
      id: 'redmine-timerbar-popover',
      type: 'popover',
      icon: 'https://raw.githubusercontent.com/Gustavohps10/redmine-plugin/main/src/icon.png',
      tooltip: 'Redmine (Integração)',
      items: [
        {
          id: 'redmine:open-current-issue',
          label: 'Abrir Tarefa no Navegador',
          icon: 'ExternalLink',
          shortcut: 'Ctrl+Shift+O',
        },
        {
          id: 'redmine:generate-fake-meeting',
          label: 'Gerar Reunião Fake (Sugestão)',
          icon: 'Sparkles',
        },
        {
          id: 'redmine:force-full-sync',
          label: 'Forçar Carga Completa',
          icon: 'DownloadCloud',
        },
        {
          id: 'redmine:apply-theme',
          label: 'Ativar Tema Redmine (Visual)',
          icon: 'Palette',
        },
      ],
    })

    // 4. Registra os handlers dos comandos declarados
    context.commands.register('redmine:open-current-issue', async () => {
      console.log('🔴 [RedmineAddon] [Comando] Abrindo tarefa no navegador...')
      return { status: 'success', url: 'https://redmine.org/issues/123' }
    })

    context.commands.register('redmine:generate-fake-meeting', async () => {
      console.log('🔴 [RedmineAddon] Gerando sugestão de reunião...')
      await context.timeEntries.createSuggestion({
        taskId: '',
        comments: 'Alinhamento Redmine - Sprint Review (30 min)',
        timeSpentSeconds: 1800,
        source: 'addon',
      })
      await context.notifications.success(
        'Sugestão "Alinhamento Redmine - Sprint Review" gerada!',
        '🔴 Redmine Plugin',
      )
      return { status: 'success' }
    })

    context.commands.register('redmine:force-full-sync', async () => {
      console.log(
        '🔴 [RedmineAddon] [Comando] Sincronização completa iniciada...',
      )
      return { status: 'success', syncedCount: 42 }
    })

    context.commands.register('redmine:apply-theme', async () => {
      await context.commands.execute('theme:set', 'redmine-classic-theme')
      await context.notifications.success(
        'Tema Clássico Redmine Ativado!',
        '🔴 Redmine Plugin',
      )
      return { status: 'success' }
    })

    // 5. Registra capacidade de Tema Visual (100% do arquivo redmine.css)
    context.themes.register({
      id: 'redmine-classic-theme',
      name: 'Redmine Classic Red',
      description: 'Tema clássico do Redmine (100% de redmine.css).',
      css: REDMINE_CSS,
    })
  }

  deactivate(): void {
    if (this.activeContext) {
      this.activeContext.themes.unregister('redmine-classic-theme')
    }
  }

  async executeAction(actionId: string): Promise<unknown> {
    if (actionId === 'apply-redmine-theme') {
      await this.activeContext?.commands.execute(
        'theme:set',
        'redmine-classic-theme',
      )
      return {
        isSuccess: true,
        display: {
          title: 'Tema Redmine Ativado!',
          message: 'Arquivo CSS completo do Redmine aplicado com sucesso.',
        },
      }
    }

    if (actionId === 'reset-theme') {
      await this.activeContext?.commands.execute('theme:set', null)
      return {
        isSuccess: true,
        display: {
          title: 'Tema Padrão Restaurado!',
          message: 'A interface retornou ao estilo nativo do Metric.',
        },
      }
    }

    return { isSuccess: false, error: 'Ação desconhecida' }
  }
}


