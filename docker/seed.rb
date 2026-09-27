# Script de inicialização e seed avançado para ambiente de testes do Redmine 3.4
# Gera 1 mês completo de dados realistas (dezenas de tarefas, journals e centenas de apontamentos)

puts "[SEED] ========================================================"
puts "[SEED] Iniciando geracao massiva de dados de 1 mes no Redmine..."
puts "[SEED] ========================================================"

# 1. Habilitar REST API
Setting.rest_api_enabled = '1'
puts "[SEED] 1. REST API habilitada (Setting.rest_api_enabled = 1)."

# 2. Carregar dados padrão do Redmine caso ainda não existam
begin
  if Tracker.count == 0 || IssueStatus.count == 0
    puts "[SEED] 2. Carregando dados padrao de idioma (en)..."
    Redmine::DefaultData::Loader.load('en')
  end
rescue => e
  puts "[SEED] 2. Aviso ao carregar dados padrao: #{e.message}"
end

# 3. Configurar Usuários
puts "[SEED] 3. Configurando usuarios..."

def configure_user(login, firstname, lastname, mail, admin_flag, api_key, atom_key)
  user = User.find_or_initialize_by(login: login)
  user.firstname = firstname
  user.lastname = lastname
  user.mail = mail
  user.admin = admin_flag
  user.password = 'admin123'
  user.password_confirmation = 'admin123'
  user.must_change_passwd = false
  user.status = User::STATUS_ACTIVE
  user.save!

  api_token = Token.find_or_create_by(user_id: user.id, action: 'api')
  api_token.update_columns(value: api_key)

  atom_token = Token.find_or_create_by(user_id: user.id, action: 'feeds')
  atom_token.update_columns(value: atom_key)

  puts "       - Usuario '#{login}' (#{firstname} #{lastname}) pronto."
  user
end

admin_user = configure_user(
  'admin', 'Redmine', 'Admin', 'admin@example.com', true,
  'testapikeyredmine1234567890abcdef', 'testatomkeyredmine1234567890abcdef'
)

carlos_dev = configure_user(
  'carlos.dev', 'Carlos', 'Silva', 'carlos@example.com', false,
  'carlosapikeyredmine1234567890abcdef', 'carlosatomkeyredmine1234567890abcdef'
)

mariana_pm = configure_user(
  'mariana.pm', 'Mariana', 'Souza', 'mariana@example.com', false,
  'marianaapikeyredmine1234567890abcdef', 'marianaatomkeyredmine1234567890abcdef'
)

beatriz_qa = configure_user(
  'beatriz.qa', 'Beatriz', 'Ramos', 'beatriz@example.com', false,
  'beatrizapikeyredmine1234567890abcdef', 'beatrizatomkeyredmine1234567890abcdef'
)

all_users = [admin_user, carlos_dev, mariana_pm, beatriz_qa]

# 4. Atividades de Apontamento
puts "[SEED] 4. Configurando atividades..."
activities_data = [
  { name: 'Desenvolvimento', is_default: true },
  { name: 'Design', is_default: false },
  { name: 'Gestão', is_default: false },
  { name: 'QA e Testes', is_default: false }
]

activities_data.each do |act_info|
  act = TimeEntryActivity.find_or_initialize_by(name: act_info[:name])
  act.is_default = act_info[:is_default]
  act.active = true
  act.save!
end

dev_act = TimeEntryActivity.find_by(name: 'Desenvolvimento')
design_act = TimeEntryActivity.find_by(name: 'Design')
mgmt_act = TimeEntryActivity.find_by(name: 'Gestão')
qa_act = TimeEntryActivity.find_by(name: 'QA e Testes')

# 5. Papéis (Roles)
manager_role = Role.find_by(name: 'Manager') || Role.first
dev_role = Role.find_by(name: 'Developer') || manager_role
reporter_role = Role.find_by(name: 'Reporter') || dev_role

# 6. Projetos
puts "[SEED] 5. Configurando projetos corporativos..."
projects_data = [
  { id: 'test-project', name: 'Test Project', desc: 'Projeto base para testes automatizados da integracao.' },
  { id: 'core-api', name: 'Core Platform & API', desc: 'Backend de microsservicos e integracoes.' },
  { id: 'desktop-app', name: 'Client Desktop & Web App', desc: 'Aplicativo Desktop Electron e timers de produtividade.' },
  { id: 'customer-portal', name: 'Customer Portal & Billing', desc: 'Portal de faturamento, faturas e relatorios analiticos.' }
]

projects = {}
projects_data.each do |p_info|
  p = Project.find_or_initialize_by(identifier: p_info[:id])
  p.name = p_info[:name]
  p.description = p_info[:desc]
  p.is_public = true
  p.trackers = Tracker.all
  p.save!
  projects[p_info[:id]] = p

  [[admin_user, manager_role], [mariana_pm, manager_role], [carlos_dev, dev_role], [beatriz_qa, reporter_role]].each do |u, r|
    Member.find_or_create_by(project: p, principal: u) do |m|
      m.roles = [r]
    end
  end
end

# 7. Status e Trackers
status_new = IssueStatus.find_by(name: 'New') || IssueStatus.first
status_in_progress = IssueStatus.find_by(name: 'In Progress') || status_new
status_resolved = IssueStatus.find_by(name: 'Resolved') || status_new
status_feedback = IssueStatus.find_by(name: 'Feedback') || status_new
status_closed = IssueStatus.find_by(name: 'Closed') || status_resolved

priority_low = IssuePriority.find_by(name: 'Low') || IssuePriority.first
priority_normal = IssuePriority.find_by(name: 'Normal') || IssuePriority.first
priority_high = IssuePriority.find_by(name: 'High') || priority_normal
priority_urgent = IssuePriority.find_by(name: 'Urgent') || priority_high

tracker_feature = Tracker.find_by(name: 'Feature') || Tracker.first
tracker_bug = Tracker.find_by(name: 'Bug') || Tracker.first
tracker_support = Tracker.find_by(name: 'Support') || Tracker.first

# 7.1 Configurar Campos Customizados Variados (Issues e Time Entries)
puts "[SEED] 5.1. Configurando campos customizados diversificados..."

cf_demand_type = IssueCustomField.find_or_initialize_by(name: 'Tipo de Demanda')
cf_demand_type.field_format = 'list'
cf_demand_type.possible_values = ['Bug Crítico', 'Feature Nova', 'Refatoração', 'Débito Técnico']
cf_demand_type.is_for_all = true
cf_demand_type.trackers = Tracker.all
cf_demand_type.save!

cf_environment = IssueCustomField.find_or_initialize_by(name: 'Ambiente')
cf_environment.field_format = 'string'
cf_environment.is_for_all = true
cf_environment.trackers = Tracker.all
cf_environment.save!

cf_story_points = IssueCustomField.find_or_initialize_by(name: 'Story Points')
cf_story_points.field_format = 'int'
cf_story_points.is_for_all = true
cf_story_points.trackers = Tracker.all
cf_story_points.save!

cf_billable = TimeEntryCustomField.find_or_initialize_by(name: 'Faturável')
cf_billable.field_format = 'list'
cf_billable.possible_values = ['Sim', 'Não', 'Cortesia']
cf_billable.is_for_all = true
cf_billable.save!

# 8. Tarefas Base Fixas (Issue 1 e 2 para testes automatizados)
puts "[SEED] 6. Configurando tarefas base..."

issue1 = Issue.find_or_initialize_by(id: 1)
issue1.project = projects['test-project']
issue1.subject = 'Issue de Teste para Integracao'
issue1.tracker = tracker_feature
issue1.status = status_new
issue1.priority = priority_normal
issue1.author = admin_user
issue1.assigned_to = admin_user
issue1.description = 'Esta e uma issue criada para os testes de integracao do plugin.'
issue1.custom_field_values = {
  cf_demand_type.id.to_s => 'Feature Nova',
  cf_environment.id.to_s => 'Staging',
  cf_story_points.id.to_s => '5'
}
issue1.save!

technical_textile_spec = <<~TEXTILE
h1. Especificação Técnica: Gateway de Pagamento e Notificações Assíncronas

h2. 1. Visão Geral da Arquitetura

Este documento define os contratos e o comportamento esperado para o processamento de cobranças e conciliação bancária via *Gateway Principal*.
A integração deve operar em regime _completamente assíncrono_, assegurando conformidade com +TLS 1.3+ e rejeitando a antiga -API v1 descontinuada-.

bq. Requisito Crítico de Negócio: Todas as requisições de estorno e cancelamento com status @DENIED@ ou @ERROR@ devem disparar alertas de telemetria imediatos.

h2. 2. Formatações e Convenções Sintáticas

* *Texto em Negrito:* Utilizado para destacar entidades críticas.
* _Texto em Itálico:_ Utilizado para termos estrangeiros e estados intermediários.
* +Texto Sublinhado:+ Utilizado para protocolos e padrões normativos.
* -Texto Tachado:- Utilizado para parâmetros deprecados.
* ?Citação Inline?: Referência aos artigos do manual operacional.
* Código inline: Utilize a diretiva @Authorization: Bearer <secret_key>@ no cabeçalho.

h2. 3. Tabela de Parâmetros de Entrada da API

|_. Parâmetro |_. Tipo de Dado |_. Obrigatório |_. Descrição e Regras |
| transaction_id | UUID v4 | Sim | Identificador universal e idempotente do pedido. |
| amount_cents | Inteiro (64-bit) | Sim | Valor monetário em centavos (ex: R$ 10,50 = @1050@). |
| currency | String(3) | Sim | Código ISO 4217 da moeda (ex: @BRL@, @USD@, @EUR@). |
| status | Enum | Sim | Estados válidos: @SUCCESS@, @PENDING@, @DENIED@, @ERROR@. |
| customer_email | String | Sim | E-mail para notificação e comprovante de transação. |

h2. 4. Etapas Operacionais e Fluxo de Execução

# *Validação de Integridade:*
## Conferência do hash HMAC-SHA256 no cabeçalho @X-Signature@.
## Rejeição imediata com código @403 Forbidden@ em caso de assinatura inválida.
# *Tratamento e Sanitização:*
## Leitura do payload JSON bruto.
## Deserialização tipada sem utilização de fallbacks cegos.

h2. 5. Exemplo de Código do Adaptador (TypeScript)

<pre><code class="typescript">
import { Either, AppError } from '@mr-tick/sdk';

export interface PaymentPayload {
  transactionId: string;
  amountCents: number;
  currency: 'BRL' | 'USD';
}

export class PaymentAdapter {
  public async process(payload: PaymentPayload): Promise<Either<AppError, boolean>> {
    if (!payload.transactionId) {
      return Either.failure(AppError.ValidationError('Identificador de transação ausente.'));
    }
    return Either.success(true);
  }
}
</code></pre>

h2. 6. Referências e Rastreabilidade

* Documentação do Protocolo: "Redmine REST API Guidelines":https://www.redmine.org/projects/redmine/wiki/Rest_api
* Tickets Relacionados: refs #1
TEXTILE

issue2 = Issue.find_or_initialize_by(id: 2)
issue2.project = projects['core-api']
issue2.subject = 'Implementar Gateway de Pagamentos e Webhooks Assíncronos'
issue2.tracker = tracker_feature
issue2.status = status_in_progress
issue2.priority = priority_urgent
issue2.author = mariana_pm
issue2.assigned_to = carlos_dev
issue2.estimated_hours = 24.0
issue2.description = technical_textile_spec
issue2.custom_field_values = {
  cf_demand_type.id.to_s => 'Bug Crítico',
  cf_environment.id.to_s => 'Produção',
  cf_story_points.id.to_s => '8'
}
issue2.save!

ActiveRecord::Base.connection.reset_pk_sequence!('issues') rescue nil

# 9. Gerador de Dezenas de Tarefas Distribuídas no Mês (Últimos 35 dias)
puts "[SEED] 7. Gerando volume de 1 mes de tarefas realistas..."

modules = [
  'Autenticação OAuth2', 'Sincronização RxDB', 'Widget de Timer', 'Dashboard Analítico',
  'Exportação PDF/CSV', 'Webhooks de Integração', 'Auditoria de Transações',
  'Notificações Push', 'Cache Redis', 'Filtro Avançado de Tarefas', 'Pipeline CI/CD',
  'Relatório de Produtividade', 'Cálculo de Horas Extras', 'Gestão de Workspaces',
  'Permissões Granulares', 'Conciliação Bancária', 'Importação em Lote'
]

actions = [
  'Implementar arquitetura de', 'Corrigir falha intermitente em', 'Otimizar consultas SQL de',
  'Refatorar camada de transporte de', 'Adicionar testes de integração para',
  'Ajustar responsividade no', 'Sanitizar payloads recebidos em', 'Configurar observabilidade de'
]

task_templates = []
actions.each do |act|
  modules.each do |mod|
    task_templates << "#{act} #{mod}"
  end
end
task_templates.shuffle!

available_projects = [projects['core-api'], projects['desktop-app'], projects['customer-portal']]
available_statuses = [status_new, status_in_progress, status_feedback, status_resolved, status_closed]
available_trackers = [tracker_feature, tracker_bug, tracker_support]
available_priorities = [priority_low, priority_normal, priority_high, priority_urgent]

created_issues = [issue1, issue2]
target_total_issues = 45

target_total_issues.times do |i|
  idx = i + 3
  existing = Issue.find_by(id: idx)
  if existing
    created_issues << existing
    next
  end

  subject_text = task_templates[i % task_templates.size]
  proj = available_projects[i % available_projects.size]
  author = [mariana_pm, admin_user, beatriz_qa][i % 3]
  assignee = [carlos_dev, admin_user, beatriz_qa, mariana_pm][i % 4]
  tracker = available_trackers[i % available_trackers.size]
  priority = available_priorities[i % available_priorities.size]

  # Dias atrás (de 35 dias até hoje)
  days_ago = ((target_total_issues - i).to_f / target_total_issues * 35).to_i
  created_date = (Date.today - days_ago.days).to_time + (9 * 3600)

  # Status dependente da idade da tarefa
  status = if days_ago > 20
    [status_resolved, status_closed].sample
  elsif days_ago > 7
    [status_in_progress, status_feedback, status_resolved].sample
  else
    [status_new, status_in_progress].sample
  end

  desc_text = <<~TEXTILE
  h2. Contexto da Demanda

  Esta tarefa contempla a execução de *#{subject_text}* no âmbito do projeto _#{proj.name}_.

  h3. Requisitos Técnicos

  # Validação de regras de negócio com cobertura de testes unitários superior a *90%*.
  # Garantir compatibilidade com contratos e interfaces existentes.
  # Registro detalhado de logs em formato JSON estruturado.

  h3. Detalhes de Implementação

  |_. Item |_. Responsável |_. Prazo |
  | Especificação | #{author.name} | #{created_date.strftime('%d/%m/%Y')} |
  | Execução | #{assignee.name} | Em andamento |

  bq. Observação: Em caso de impedimento, acionar o time imediatamente no canal de engenharia.
  TEXTILE

  issue = Issue.new
  issue.project = proj
  issue.subject = subject_text
  issue.tracker = tracker
  issue.status = status
  issue.priority = priority
  issue.author = author
  issue.assigned_to = assignee
  issue.estimated_hours = [4.0, 8.0, 16.0, 24.0, 32.0].sample
  issue.description = desc_text
  issue.created_on = created_date
  issue.updated_on = created_date + (rand(1..5) * 86400)
  issue.custom_field_values = {
    cf_demand_type.id.to_s => ['Bug Crítico', 'Feature Nova', 'Refatoração', 'Débito Técnico'].sample,
    cf_environment.id.to_s => ['Desenvolvimento', 'Staging', 'Produção', 'Homologação'].sample,
    cf_story_points.id.to_s => [1, 2, 3, 5, 8, 13].sample.to_s
  }
  issue.save!

  created_issues << issue
end
puts "       - #{Issue.count} tarefas criadas e estruturadas."

# 10. Gerar Histórico e Comentários (Journals)
puts "[SEED] 8. Gerando historico e discussoes (journals)..."

discussion_notes = [
  "Iniciando a analise tecnica e reproducao do cenario em ambiente local.",
  "Mapeamento de dependencias concluido. Nenhuma regressao identificada nos servicos adjacentes.",
  "Primeira versao da solucao implementada. Testes unitarios passando com 100% de sucesso.",
  "Validado em homologacao. PR submetido para code review da equipe.",
  "Reteste executado em ambiente isolado. Cenarios de borda validados com sucesso.",
  "Alinhado com a gerencia de produtos. Mudanca aprovada para deploy."
]

created_issues.each_with_index do |iss, idx|
  next if iss.journals.count > 0 || idx == 0

  # Adicionar de 1 a 3 journals por tarefa
  num_journals = (idx % 3) + 1
  base_time = iss.created_on

  num_journals.times do |j_i|
    note_user = [carlos_dev, beatriz_qa, mariana_pm, admin_user][(idx + j_i) % 4]
    j_time = base_time + ((j_i + 1) * 3600 * 24)
    next if j_time > Time.now

    j = iss.journals.create!(
      user: note_user,
      notes: discussion_notes[(idx + j_i) % discussion_notes.size],
      created_on: j_time
    )

    if j_i == 0 && iss.status != status_new
      j.details.create!(
        property: 'attr',
        prop_key: 'status_id',
        old_value: status_new.id.to_s,
        value: status_in_progress.id.to_s
      )
    end
  end
end
puts "       - #{Journal.count} comentarios e transicoes de status registrados."

# 11. Gerar Volume Diário de Lançamentos de Horas (Últimos 30 Dias)
puts "[SEED] 9. Gerando lancamentos diarios de horas para o ultimo mes..."

time_entry_comments = [
  'Desenvolvimento de logica de negocio e validacoes',
  'Refatoracao de servicos e otimizacao de consultas',
  'Criacao de testes unitarios e mocks de integracao',
  'Correcao de bug reportado em homologacao',
  'Code review e analise estatica de tipos',
  'Alinhamento diario de sprint e planejamento de entregas',
  'Execucao de plano de testes manuais e regressivos',
  'Documentacao de contratos e interfaces OpenAPI'
]

# De 30 dias atrás até hoje
start_date = Date.today - 30.days
end_date = Date.today

existing_time_entries_count = TimeEntry.count
new_entries_generated = 0

(start_date..end_date).each do |current_day|
  # Ignorar finais de semana para manter realismo corporativo
  next if current_day.saturday? || current_day.sunday?

  # Cada usuário aponta horas todo dia útil
  all_users.each do |user|
    # Determinar atividade e perfil de apontamento do usuário
    user_activity = case user.login
    when 'carlos.dev' then dev_act
    when 'beatriz.qa' then qa_act
    when 'mariana.pm' then mgmt_act
    else [dev_act, design_act, mgmt_act].sample
    end

    # Escolher uma tarefa coerente com o projeto
    candidate_issues = created_issues.select { |i| i.created_on.to_date <= current_day }
    target_issue = candidate_issues.sample || issue1

    # 1 ou 2 apontamentos por dia, totalizando entre 6.0 e 8.0 horas
    shifts = [
      { hours: [3.5, 4.0, 4.5].sample, time_offset: 9 },
      { hours: [2.5, 3.0, 3.5].sample, time_offset: 14 }
    ]

    shifts.each_with_index do |shift, s_idx|
      comment = time_entry_comments[(current_day.day + user.id + s_idx) % time_entry_comments.size]
      entry_time = current_day.to_time + (shift[:time_offset] * 3600)

      # Evitar duplicar no mesmo dia/usuario se já rodou
      next if TimeEntry.where(user_id: user.id, spent_on: current_day, hours: shift[:hours], comments: comment).exists?

      te = TimeEntry.new(
        project: target_issue.project,
        issue: target_issue,
        user: user,
        activity: user_activity,
        hours: shift[:hours],
        comments: comment,
        spent_on: current_day
      )
      te.created_on = entry_time
      te.updated_on = entry_time
      te.custom_field_values = {
        cf_billable.id.to_s => ['Sim', 'Não', 'Cortesia'].sample
      }
      te.save!
      new_entries_generated += 1
    end
  end
end

puts "       - #{new_entries_generated} novos lancamentos gerados."

ActiveRecord::Base.connection.tables.each do |t|
  ActiveRecord::Base.connection.reset_pk_sequence!(t) rescue nil
end

puts "[SEED] ========================================================"
puts "[SEED] SEED MASSIVO CONCLUIDO COM SUCESSO!"
puts "[SEED] Total de Projetos:              #{Project.count}"
puts "[SEED] Total de Usuarios:              #{User.count}"
puts "[SEED] Total de Tarefas (Issues):      #{Issue.count}"
puts "[SEED] Total de Journals (Historico):  #{Journal.count}"
puts "[SEED] Total de Lancamentos de Horas:  #{TimeEntry.count}"
puts "[SEED] Intervalo de Dados:             #{start_date.strftime('%d/%m/%Y')} a #{end_date.strftime('%d/%m/%Y')}"
puts "[SEED] ========================================================"
