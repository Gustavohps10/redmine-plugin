import { AddonContext, IAddon } from '@mr-tick/sdk'

import { REDMINE_CSS } from './redmineCss.js'
import { RedmineDataSource } from './RedmineDataSource.js'

export default class RedmineAddon implements IAddon {
  private activeContext: AddonContext | null = null

  activate(context: AddonContext): void {
    this.activeContext = context

    context.dataSources.register(new RedmineDataSource())

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
          id: 'redmine:apply-theme',
          label: 'Ativar Tema Redmine (Visual)',
          icon: 'Palette',
        },
      ],
    })

    context.commands.register('redmine:open-current-issue', async () => {
      return { status: 'success' }
    })

    context.commands.register('redmine:apply-theme', async () => {
      await context.commands.execute('theme:set', 'redmine-classic-theme')
      await context.notifications.success(
        'Tema Clássico Redmine Ativado!',
        'Redmine Plugin',
      )
      return { status: 'success' }
    })

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
}
