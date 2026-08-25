import { AddonSettingsGroup, AddonSettingsTab } from '@metric-org/sdk'

export const credentialFieldGroups: AddonSettingsGroup[] = [
  {
    id: 'auth-keys',
    label: 'Chaves de Acesso',
    fields: [
      {
        id: 'apiKey',
        label: 'Chave de Acesso à API (REST)',
        type: 'password',
      },
      {
        id: 'atomKey',
        label: 'Chave de Acesso ao Atom (RSS)',
        type: 'password',
      },
    ],
  },
]

export const configurationFieldGroups: AddonSettingsGroup[] = [
  {
    id: 'connection',
    label: 'Configuração da Conexão',
    fields: [
      {
        id: 'apiUrl',
        label: 'URL da sua instância Redmine',
        type: 'text',
        placeholder: 'https://redmine.suaempresa.com',
      },
    ],
  },
]

export const customFieldGroups: AddonSettingsGroup[] = [
  {
    id: 'custom-mappings',
    label: 'Configurações Avançadas e Logs',
    description:
      'Defina preferências de sincronização e armazenamento local para este addon.',
    fields: [
      {
        id: 'customFieldEnableAutoSync',
        label: 'Sincronização Automática de Metadados',
        type: 'boolean',
        defaultValue: true,
        description:
          'Habilita a sincronização periódica de metadados da instância.',
      },
      {
        id: 'customFieldSyncInterval',
        label: 'Intervalo de Sincronização (minutos)',
        type: 'number',
        defaultValue: 15,
        description: 'Tempo entre cada ciclo de sincronização automática.',
      },
      {
        id: 'customFieldLogLevel',
        label: 'Nível de Detalhamento de Log',
        type: 'select',
        defaultValue: 'info',
        description:
          'Nível de log interno gerado durante a execução do plugin.',
        options: [
          { label: 'Informativo (Info)', value: 'info' },
          { label: 'Depuração (Debug)', value: 'debug' },
          { label: 'Avisos Apenas (Warning)', value: 'warning' },
          { label: 'Erros Apenas (Error)', value: 'error' },
        ],
      },
      {
        id: 'customFieldExportDirectory',
        label: 'Diretório Local de Logs / Cache',
        type: 'directory',
        placeholder: '/caminho/para/logs',
        description:
          'Selecione o diretório local onde os relatórios e logs serão gravados.',
      },
    ],
  },
]

export const themeFieldGroups: AddonSettingsGroup[] = [
  {
    id: 'theme_controls',
    label: 'Tema Redmine Classic',
    description:
      'Aplique o arquivo CSS clássico do Redmine com todas as variáveis, modo claro/escuro e estilos.',
    fields: [
      {
        id: 'apply-redmine-theme',
        type: 'button',
        label: 'Ativar Tema Redmine',
        actionId: 'apply-redmine-theme',
      },
      {
        id: 'reset-theme',
        type: 'button',
        label: 'Restaurar Tema Padrão',
        variant: 'destructive',
        actionId: 'reset-theme',
      },
    ],
  },
]

export const redmineSettingsSchema: AddonSettingsTab[] = [
  {
    id: 'theme',
    label: 'Tema Visual',
    description: 'Personalização de cores e tema fornecido pelo Redmine',
    groups: themeFieldGroups,
  },
  {
    id: 'custom-fields',
    label: 'Configurações Avançadas',
    description: 'Preferências de execução, sincronização e logs locais',
    groups: customFieldGroups,
  },
]
