# Auditoria de duplicações funcionais — Enterprise Performance

Data: 22/10/2026. Base: main após o merge do PR #40 (`e1a56af`).

## Critério

A auditoria cruza o catálogo de navegação, os componentes abertos por cada destino, os comandos enviados e a persistência utilizada. Nomes semelhantes não provam duplicação; duas vistas que usam a mesma entidade não são duas fontes de verdade. Em contrapartida, dois formulários para a mesma operação ou duas cópias da mesma aritmética podem divergir.

Não foram fundidos dados de origens diferentes nem eliminados registos, revisões, mapas, campos ou APIs. A plataforma continua a consumir dados de ERPs, entradas manuais e RH, sem acrescentar escrituração contabilística.

## Correções aplicadas

| Achado confirmado | Evidência | Correção |
|---|---|---|
| Cadastro de colaboradores exposto na Organização e no RH | Ambos abriam `ConfiguracaoReal`, etapa 3, com o mesmo comando `employee` e subsequente contrato/ficha | A administração permite apenas Organização, Utilizadores e Dimensões. O diretório/cadastro é aberto no RH. A navegação para o diretório deixa de lançar automaticamente um novo cadastro. |
| Formulário de salário base repetido | `PayrollFoundation` e `EmployeePayrollFile` enviavam `salaryProfile` para o mesmo motor | A ação da lista de perfis abre a própria ficha na aba Remuneração. O segundo formulário foi removido. A dimensão de imputação passou a poder ser escolhida na ficha; a periodicidade mensal é preservada. |
| Plano de negócios e cash-flow apresentados como destinos independentes | `Modelação` e `Cash-flow` montavam `FinancialModelsWorkspace`, com as mesmas entidades `financial_models`, linhas e projeções | Um único destino público, Plano de negócios mensal, em Planeamento e orçamento. Os pressupostos e a caixa são abas do mesmo plano. A rota interna antiga continua a abrir a vista de caixa por compatibilidade. |
| Nomes pouco claros entre plano mensal e viabilidade | O menu apresentava “Drivers e plano de negócios” junto ao estudo com projeções anuais e avaliação | O plano mensal tem título, pressupostos e caixa identificados. A Modelagem financeira mantém o estudo de viabilidade. A interface explica que cada plano, orçamento e estudo conserva pressupostos e versões próprios. |
| Aritmética de datas e dinheiro copiada | `worker/financial-models.ts` e `lib/budget-drivers.ts` continham cópias de datas, capitalização e percentagens | Funções puras centralizadas em `lib/financial-arithmetic.ts`. A normalização do orçamento permanece no seu adaptador; o contrato estrito do plano mensal não mudou. |

## Inventário de sobreposições e decisão

| Área / funções próximas | Fonte ou comportamento observado | Local de responsabilidade / decisão |
|---|---|---|
| Organização / cadastro de colaboradores | Estrutura organizacional e registo pessoal são entidades diferentes | Organização gere unidades; RH cria colaboradores e mantém a ficha. Corrigido o acesso duplicado. |
| Utilizadores / colaboradores | Contas de acesso e vínculos laborais têm dados e permissões diferentes | Administração gere login/perfil/convites; RH gere pessoas. Não fundir as entidades. |
| Diretório / ficha do colaborador | O diretório lista/cria; a ficha mantém dados e salário | Ambos no RH; a ficha é reutilizada, não copiada. |
| Contratos / dados profissionais na ficha | Contratos possuem ciclo de vida e datas; a ficha consome os contratos reais | RH: diretório/ficha e gestão contratual. Não criar contrato a partir de uma segunda ficha. |
| Salário base / perfis salariais | Mesma operação `salaryProfile` | Um formulário: ficha do colaborador. Corrigido. |
| Rubricas recorrentes / catálogo operacional de payroll | A ficha atribui remunerações recorrentes; a operação global suporta também revisão fiscal e categorias adicionais | Mesmos registos e motor. Preservado o catálogo global: retirar estes controlos faria perder funcionalidades fiscais que a ficha simplificada não oferece. |
| Variáveis na ficha / folha mensal | A ficha consulta entradas por mês; a folha prepara e guarda | Entrada na folha mensal; consulta contextual na ficha. Não duplicar por copiar valores. |
| Folha mensal / histórico / recibos / lotes | Entradas, evidência de processamento, documento e pagamento são fases diferentes | Um motor salarial; vistas de preparação, consulta e saída preservadas. |
| Ausências / folhas de tempo / descontos | Evidências operacionais e valores salariais não são intercambiáveis | RH conserva origem; não inferir descontos ou faltas apenas por coincidência de campos. |
| Efetivos / custos da equipa / orçamento de pessoal | Planeamento de quantidades, custos realizados e ligação ao orçamento têm bases diferentes | Efetivos é dono do plano; payroll é dono do custo processado; integração orçamental consome planos aprovados. |
| Objetivos / ações / avaliações / competências | Metas, tarefas, evidências capturadas e pontuações são entidades próprias | Performance; manter ligações e snapshots, sem transformar ações em objetivos fictícios. |
| Caixa de tarefas / aprovações nos módulos | A caixa navega para o processo; a decisão e a segregação pertencem ao módulo de origem | Workflow é uma caixa agregadora, não um segundo motor de aprovação. |
| Fontes / mappings / monitorização | Vistas do mesmo `IntegrationsWorkspace` | Um centro de integrações com abas; acessos contextuais são atalhos legítimos. |
| Mappings de integrações / financeiros | O centro mostra cobertura; Dados financeiros permite governar o mapeamento consumidor | Preservar a autoridade do mapeamento financeiro; não copiar configuração para o monitor. |
| Document Hub / documentos pessoais | Ingestão/OCR empresarial e documentos com âmbito de colaborador têm permissões e finalidades diferentes | Não fundir repositórios ou alargar acesso. |
| Dados financeiros / introdução manual / importação ERP | Caminhos diferentes alimentam as entradas de desempenho, com origem, revisão e reconciliação | Dados financeiros é dono da ingestão; não somar novamente uma vista desses dados. |
| Orçamento anual / realizado e orçamento / cenários | Mapa anual edita linhas/pressupostos por versão; outras vistas mostram ou comparam entradas/versões | Planeamento e orçamento. A coincidência de meses não autoriza fundir versões. |
| Drivers do orçamento / drivers do plano mensal | Orçamento suporta quantidade×preço, crescimento, sazonalidade, contratos e proteção manual; plano mensal suporta linhas fixas/dependentes, desfasamento de caixa e aprovação própria | Aritmética comum deduplicada; modelos preservados. Não existe transferência automática entre estas entidades. |
| Plano de negócios mensal / estudo de viabilidade | Plano: linhas mensais e caixa por desfasamento. Estudo: investimento, fundo de maneio, fiscalidade, dívida, sócios e VAL/TIR | Planeamento mensal e Modelagem financeira, respetivamente. Não são dois nomes para o mesmo conjunto de dados. |
| Tesouraria / caixa do plano / caixa projetada do estudo | Movimentos/obrigações, projeção mensal e projeção de investimento são bases distintas | Tesouraria gere pagar/receber; as duas projeções permanecem dentro do respetivo plano/estudo. Removido o destino duplicado de caixa do plano. |
| Financiamento na tesouraria / dívida no estudo | Uma obrigação real não é uma hipótese de financiamento | Manter distinção; não criar obrigação real a partir de uma simulação. |
| Demonstrações realizadas / demonstrações projetadas | Dados importados/manuais e pressupostos de estudo têm bases distintas | Análise financeira para realizado; mapas ligados ao estudo para projetado. Não misturar os resultados. |
| Catálogo de rubricas / dimensões | Classificação financeira e eixos organizacionais são configurações partilhadas | Um cadastro por entidade; ligações a partir de Finanças são atalhos para essa configuração. |
| Dashboards executivos / cockpit CFO / RH | Consumidores de motores e âmbitos próprios | Vistas analíticas, não novos cadastros. |
| Mapas do estudo / central de mapas / exportações | Os documentos usam o identificador e a versão do estudo, com o mesmo workbook | Um gerador e mesma origem; a central é catálogo, não uma segunda modelagem. |
| Relatório de gestão / dashboards / mapas de estudo | Relatório de gestão guarda uma versão; dashboard consulta; estudo simula | Manter a diferença entre evidência versionada, consulta e projeção. |
| Consolidação / análise por empresa | Consolidação inclui perímetro e regras próprias | Não tratar a mera soma de empresas como uma cópia do consolidado. |
| Auditoria recente / histórico de decisões | Registos comuns apresentados em contextos diferentes | Vistas de leitura; não eliminar evidências para reduzir menus. |
| Estudos/casos antigos / novo estudo integrado | Há formatos e fluxos anteriores com compatibilidade de leitura e cálculo | Preservar históricos. Não converter silenciosamente resultados entre versões do modelo. |

## Lacunas identificadas que não podem ser resolvidas por apagar menus

1. Plano de negócios mensal e orçamento anual têm persistências e workflows independentes. Centralizar os pressupostos económicos entre eles exige uma ligação explícita, regras de correspondência de linhas, periodicidade, versão e atualização. Nesta alteração não se inventou essa integração nem se copiaram números automaticamente.
2. A mesma empresa pode ter realizado importado, manual e proveniente de módulos internos. A prevenção de dupla contagem depende das regras de ingestão, origem e reconciliação, não de ocultar uma dessas fontes.
3. Rubricas globais e individuais usam o mesmo motor, mas não oferecem todas as mesmas categorias. A auditoria preserva os controlos fiscais globais; a unificação visual futura deve manter a totalidade dessas categorias.

## Validação e limites

- Alterações isoladas a partir da main publicada. Nenhuma migração ou eliminação de dados.
- Testes de orçamento e modelos verificam os cálculos; testes específicos protegem as fronteiras de ano, arredondamento com sinal e a diferença de normalização.
- Teste React/API local confirma: Administração não abre cadastro pessoal; o diretório RH mantém cadastro e campos contratuais; o acesso pelos perfis usa a ficha salarial canónica; uma única revisão pela API preserva histórico, dimensão e periodicidade.
- Navegação conserva as cinco áreas financeiras e limita o plano mensal a um destino público.
- Tipagem e auditoria de idiomas: verificar logs da entrega. Comparação visual/publicação desta nova alteração é uma etapa separada; não se declara que esta branch já está em produção.

O inventário cobre as áreas catalogadas e os caminhos funcionais inspecionados. Não constitui prova de inexistência de toda e qualquer duplicação em cada linha do repositório.
