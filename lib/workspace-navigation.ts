import type {PlatformLocale} from './platform-i18n';
type Five=readonly [string,string,string,string,string];
export const workspaceCopy={
 analysis:['Análise financeira','Financial analysis','Análisis financiero','Analyse financière','Финансовый анализ'],
 budget:['Planeamento e orçamento','Planning and budgeting','Planificación y presupuesto','Planification et budget','Планирование и бюджет'],
 model:['Modelagem financeira','Financial modeling','Modelización financiera','Modélisation financière','Финансовое моделирование'],
 liquidity:['Liquidez e financiamento','Liquidity and financing','Liquidez y financiación','Liquidité et financement','Ликвидность и финансирование'],
 consolidation:['Consolidação','Consolidation','Consolidación','Consolidation','Консолидация'],
 data:['Dados e configurações','Data and settings','Datos y configuración','Données et paramètres','Данные и настройки'],
 overview:['Visão de RH','HR overview','Visión de RR. HH.','Vue RH','Обзор кадров'],
 people:['Pessoas e contratos','People and contracts','Personas y contratos','Personnel et contrats','Сотрудники и договоры'],
 time:['Tempo e ausências','Time and absence','Tiempo y ausencias','Temps et absences','Рабочее время и отсутствия'],
 payroll:['Remunerações e processamento','Compensation and payroll','Remuneración y nómina','Rémunération et paie','Оплата труда и расчёт зарплаты'],
 talent:['Recrutamento e integração','Recruitment and onboarding','Selección e incorporación','Recrutement et intégration','Подбор и адаптация'],
 workforce:['Planeamento de efetivos','Workforce planning','Planificación de plantilla','Planification des effectifs','Планирование численности'],
 cost:['Custos da equipa','Workforce costs','Costes de plantilla','Coûts du personnel','Затраты на персонал'],
 goals:['Objetivos e ações','Goals and actions','Objetivos y acciones','Objectifs et actions','Цели и действия'],
 reviews:['Avaliações e desenvolvimento','Reviews and development','Evaluaciones y desarrollo','Évaluations et développement','Оценка и развитие'],
 skills:['Competências e 360°','Competencies and 360°','Competencias y 360°','Compétences et 360°','Компетенции и 360°'],
 dashboards:['Dashboards','Dashboards','Paneles','Tableaux de bord','Панели показателей'],
 reports:['Mapas e relatórios','Statements and reports','Estados e informes','États et rapports','Ведомости и отчёты'],
 inbox:['Tarefas e aprovações','Tasks and approvals','Tareas y aprobaciones','Tâches et approbations','Задачи и согласования'],
 history:['Histórico de decisões','Decision history','Historial de decisiones','Historique des décisions','История решений'],
 workflow:['Fluxos e aprovações','Workflows and approvals','Flujos y aprobaciones','Circuits et approbations','Процессы и согласования'],
 sources:['Fontes e mapeamentos','Sources and mappings','Fuentes y asignaciones','Sources et correspondances','Источники и сопоставления'],
 monitoring:['Monitorização','Monitoring','Supervisión','Suivi','Мониторинг'],
 documents:['Documentos e OCR','Documents and OCR','Documentos y OCR','Documents et OCR','Документы и OCR'],
 organization:['Organização e configuração','Organization and settings','Organización y configuración','Organisation et paramètres','Организация и настройки'],
 users:['Utilizadores e acessos','Users and access','Usuarios y accesos','Utilisateurs et accès','Пользователи и доступ'],
 subscription:['Ativação e subscrição','Activation and subscription','Activación y suscripción','Activation et abonnement','Активация и подписка'],
 audit:['Auditoria e integridade','Audit and integrity','Auditoría e integridad','Audit et intégrité','Аудит и целостность'],
 demo:['Demonstração guiada','Guided demonstration','Demostración guiada','Démonstration guidée','Демонстрация'],
 support:['Dados e operações de apoio','Supporting data and operations','Datos y operaciones de apoyo','Données et opérations de soutien','Данные и вспомогательные операции'],
 connections:['Estado das ligações','Connection status','Estado de conexiones','État des connexions','Состояние соединений'],
 module:['Módulo','Module','Módulo','Module','Модуль'],
 more:['Mais módulos','More modules','Más módulos','Autres modules','Другие модули'],
 back:['Voltar aos mapas','Back to reports','Volver a informes','Retour aux rapports','Назад к отчётам'],
 origin:['Abrir processo de origem','Open source process','Abrir proceso de origen',"Ouvrir le processus d’origine",'Открыть исходный процесс'],
 print:['Imprimir / PDF','Print / PDF','Imprimir / PDF','Imprimer / PDF','Печать / PDF'],
 study:['Estudo financeiro','Financial study','Estudio financiero','Étude financière','Финансовое исследование'],
 chooseStudy:['Escolher estudo','Choose study','Elegir estudio','Choisir une étude','Выбрать исследование'],
 noStudies:['Ainda não existem estudos guardados.','No saved studies yet.','Todavía no hay estudios guardados.',"Aucune étude enregistrée.",'Сохранённых исследований пока нет.'],
 studyUnavailable:['O estudo de origem já não está disponível neste âmbito.','The source study is no longer available in this scope.','El estudio de origen ya no está disponible en este ámbito.',"L’étude d’origine n’est plus disponible dans ce périmètre.",'Исходное исследование больше не доступно в этой области.'],
 loading:['A carregar…','Loading…','Cargando…','Chargement…','Загрузка…'],
 loadError:['Não foi possível carregar os estudos.','Could not load studies.','No se pudieron cargar los estudios.',"Impossible de charger les études.",'Не удалось загрузить исследования.'],
 retry:['Tentar novamente','Try again','Reintentar','Réessayer','Повторить'],
 map:['Mapa','Statement','Estado','État','Ведомость'],
 close:['Voltar ao trabalho','Return to work','Volver al trabajo','Revenir au travail','Вернуться к работе'],
 process:['Processo de origem','Source process','Proceso de origen',"Processus d’origine",'Исходный процесс'],
 settings:['Configurações','Settings','Configuración','Paramètres','Настройки'],
 all:['Todos os módulos','All modules','Todos los módulos','Tous les modules','Все модули'],
 menu:['Navegação do módulo','Module navigation','Navegación del módulo','Navigation du module','Навигация модуля'],
 general:['Visão geral','Overview','Visión general',"Vue d’ensemble",'Обзор'],
 portals:['Portais de pessoas','People portals','Portales de personas','Portails du personnel','Порталы сотрудников'],
 filename:['Nome','Name','Nombre','Nom','Название'],
 area:['Área','Area','Área','Domaine','Область'],
 open:['Abrir','Open','Abrir','Ouvrir','Открыть'],
 main:['Área de trabalho','Workspace','Área de trabajo','Espace de travail','Рабочая область'],
 assumptions:['Pressupostos','Assumptions','Supuestos','Hypothèses','Предпосылки'],
 results:['Resultados','Results','Resultados','Résultats','Результаты'],
 methodology:['Metodologia','Methodology','Metodología','Méthodologie','Методология'],
 activity:['Atividade','Activity','Actividad','Activité','Деятельность'],
 investment:['Investimento','Investment','Inversión','Investissement','Инвестиции'],
 growth:['Crescimento','Growth','Crecimiento','Croissance','Рост'],
 workingCapital:['Fundo de maneio','Working capital','Capital circulante','Fonds de roulement','Оборотный капитал'],
 taxes:['Fiscalidade','Tax assumptions','Fiscalidad','Fiscalité','Налоговые предпосылки'],
 financing:['Financiamento e pressupostos avançados','Financing and advanced assumptions','Financiación y supuestos avanzados','Financement et hypothèses avancées','Финансирование и расширенные предпосылки'],
} as const satisfies Record<string,Five>;
export type WorkspaceLabel=keyof typeof workspaceCopy;
export const workspaceText=(locale:PlatformLocale,key:WorkspaceLabel)=>workspaceCopy[key][{pt:0,en:1,es:2,fr:3,ru:4}[locale]];
export type WorkspaceGroup={id:WorkspaceLabel;targets:readonly string[];support?:boolean};
export type WorkspaceDomain={code:string;label:WorkspaceLabel;groups:WorkspaceGroup[]};
export const workspaceDomains:WorkspaceDomain[]=[
 {code:'FINANCE_FP&A',label:'analysis',groups:[
  {id:'analysis',targets:['Cockpit CFO','Demonstrações','Performance Financeira','Desvios Financeiros','Rentabilidade','Diagnóstico']},
  {id:'budget',targets:['Mapa Orçamental Anual','Planeamento','Cenários']},
  {id:'model',targets:['Investimento','Modelação']},
  {id:'liquidity',targets:['Tesouraria','Working Capital','Cash-flow','Extratos bancários']},
  {id:'consolidation',targets:['Consolidação']},
  {id:'data',targets:['Dados financeiros','Catálogo de Rubricas','Automatização','Administração'],support:true}]},
 {code:'HCM',label:'people',groups:[{id:'overview',targets:['RH Dashboard']},{id:'people',targets:['Ficha do colaborador','Employee Master','Pessoas']},{id:'time',targets:['Assiduidade','Ausências']},{id:'payroll',targets:['Processamentos','Operações','Simulador Salarial','Histórico salarial','Empréstimos','Retroativos']},{id:'talent',targets:['Recrutamento']}]},
 {code:'WORKFORCE_PLANNING',label:'workforce',groups:[{id:'cost',targets:['Análises']},{id:'workforce',targets:['Headcount']}]},
 {code:'PERFORMANCE_MANAGEMENT',label:'goals',groups:[{id:'goals',targets:['Objetivos','Ações']},{id:'reviews',targets:['Avaliações']},{id:'skills',targets:['Competências']}]},
 {code:'ANALYTICS_REPORTING',label:'dashboards',groups:[{id:'dashboards',targets:['Visão geral','Cockpits por perfil']},{id:'reports',targets:['Catálogo Analytics','Relatórios']}]},
 {code:'WORKFLOW',label:'workflow',groups:[{id:'inbox',targets:['Workflow']},{id:'history',targets:['Histórico de decisões']}]},
 {code:'INTEGRATIONS',label:'sources',groups:[{id:'sources',targets:['Fontes de integração','Mappings de integração']},{id:'monitoring',targets:['Integrações']},{id:'documents',targets:['Documentos']}]},
 {code:'CORE',label:'organization',groups:[{id:'organization',targets:['Administração']},{id:'users',targets:['Utilizadores']},{id:'subscription',targets:['Ativação']},{id:'audit',targets:['Auditoria','Controlo']},{id:'documents',targets:['Documentos'],support:true},{id:'demo',targets:['Centro Comercial'],support:true}]},
];
export type NavigationCatalog=Array<{code:string;accessCodes?:string[];items:Array<{target?:string;requires?:string;label:string;document?:boolean;future?:boolean}>}>;
export function accessibleWorkspaces(catalog:NavigationCatalog,modules:readonly string[]):WorkspaceDomain[]{
 const allowed=new Set(catalog.filter(d=>(d.accessCodes||[d.code]).some(code=>modules.includes(code))).flatMap(d=>d.items.filter(i=>!i.requires||modules.includes(i.requires)).map(i=>i.target)));
 return workspaceDomains.filter(d=>modules.includes(d.code)||(d.code==='HCM'&&modules.includes('PAYROLL'))).map(d=>({...d,groups:d.groups.map(g=>({...g,targets:g.targets.filter(t=>allowed.has(t))})).filter(g=>g.targets.length)})).filter(d=>d.groups.length&&(d.code!=='WORKFLOW'||modules.includes('WORKFLOW'))&&(d.code!=='INTEGRATIONS'||modules.includes('INTEGRATIONS')));
}
export function workspaceForTarget(domains:WorkspaceDomain[],target:string,preferred?:string){
 const previous=domains.find(d=>d.code===preferred&&d.groups.some(g=>g.targets.includes(target)));
 const owner=target==='Administração'?domains.find(d=>d.code==='CORE'):undefined;
 return previous||owner||domains.find(d=>d.groups.some(g=>g.targets.includes(target)));
}
