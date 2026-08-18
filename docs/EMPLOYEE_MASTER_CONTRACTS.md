# Employee Master + Contratos — definição antes da implementação

## Objetivo
Manter a identidade laboral e o vínculo contratual do colaborador de forma agnóstica a país. Nenhuma regra fiscal, laboral ou contabilística é codificada no core.

## Entidades
- `employees`: identidade organizacional e estado derivado do vínculo.
- `employee_contracts`: número, tipo configurável, vigência, horário, minutos semanais, Country Pack opcional e estado.

## Regras de negócio
- O número do colaborador e o número do contrato são únicos por tenant.
- Só pode existir um contrato ativo por colaborador.
- O contrato nasce em `Rascunho` e segue `Rascunho → Ativo → Terminado`.
- A data final não pode anteceder a data inicial.
- A ativação torna o colaborador ativo; o término torna-o inativo.
- Payroll exige contrato ativo e vigente, além do perfil salarial ativo.
- `contract_type`, `work_schedule` e `country_pack` são configurações, não regras hardcoded.

## Permissões e segregação
- `hcm:write`: Administrador e Recursos Humanos.
- Leitura respeita tenant e eventual âmbito organizacional.
- Financeiro, Gestor e Leitura não alteram contratos.

## Workflow
1. Administração cria o Employee Master em estado pendente.
2. RH cria o contrato em rascunho.
3. RH valida e ativa o contrato.
4. Payroll pode configurar e processar remuneração durante a vigência.
5. RH termina o contrato com data efetiva; o colaborador deixa de ser elegível.

## API
- `GET /api/v1/hcm`: colaboradores, contratos e auditoria autorizada.
- `POST /api/v1/hcm` com `createContract`, `activateContract` ou `endContract`.
- Conflitos de estado retornam `409`; âmbito inválido retorna `403`; invariantes retornam `422`.

## UI
Próximo checkpoint: workspace Pessoas com lista mestre, detalhe contratual, criação, ativação e término. Nenhuma página de Attendance ou Leave será criada nesta fase.

## Testes e audit trail
- Migrations completas numa base limpa.
- Isolamento por tenant e organização.
- Datas, carga semanal, unicidade e transições.
- Elegibilidade de Payroll por contrato vigente.
- Eventos `CREATE`, `ACTIVATE` e `END` em `audit_events`.

## Integrações
- Payroll consome apenas contratos ativos e vigentes.
- Workforce recebe custos somente após Payroll fechado.
- Country Packs futuros fornecem regras externas sem alterar o core contratual.
