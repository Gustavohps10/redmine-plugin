import { AddonContext, IAddon } from '@mr-tick/sdk'

import { RedmineDataSource } from './datasource'
import { REDMINE_CSS } from './theme'

export default class RedmineAddon implements IAddon {
  private activeContext: AddonContext | null = null

  activate(context: AddonContext): void {
    this.activeContext = context

    context.contributions.dataSources.register(new RedmineDataSource())

    context.contributions.menus.sidebar.register({
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

    context.contributions.menus.timerbar.register({
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
          id: 'redmine:apply-theme',
          label: 'Ativar Tema Redmine (Visual)',
          icon: 'Palette',
        },
      ],
    })

    context.contributions.commands.register(
      'redmine:open-current-issue',
      async () => {
        return { status: 'success' }
      },
    )

    context.contributions.commands.register('redmine:apply-theme', async () => {
      await context.contributions.commands.execute(
        'theme:set',
        'redmine-classic-theme',
      )
      await context.host.notifications.success(
        'Tema Clássico Redmine Ativado!',
        'Redmine Plugin',
      )
      return { status: 'success' }
    })

    context.contributions.themes.register({
      id: 'redmine-classic-theme',
      name: 'Redmine Classic Red',
      description: 'Tema clássico do Redmine (100% de redmine.css).',
      css: REDMINE_CSS,
    })
  }

  deactivate(): void {
    if (!this.activeContext) return

    this.activeContext.contributions.themes.unregister('redmine-classic-theme')
    this.activeContext = null
  }
}
