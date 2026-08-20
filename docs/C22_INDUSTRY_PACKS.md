# C22 — Industry Packs e contexto do negócio

## Objetivo

Alinhar métricas, pesos, regras e recomendações ao setor e ao `core business` de cada empresa sem introduzir regras setoriais, fiscais ou nacionais no Core.

## Fronteiras

- O catálogo global contém setores, packs versionados, métricas e regras de referência.
- O perfil do tenant guarda setor, pack, país e descrição livre do core business.
- A instalação cria um `diagnostic_framework` em **Rascunho**; nunca ativa metodologia automaticamente.
- Um segundo utilizador com papel Administrador ou Financeiro deve validar e ativar o framework (maker-checker).
- Trocar de pack não reescreve frameworks, diagnósticos ou resultados anteriores. A instalação anterior passa para **Substituído**.
- O pack de Serviços Financeiros é piloto e explicitamente não regulatório. Country Packs futuros complementam, mas não alteram, esta camada.

## Catálogo inicial

| Pack | Setores iniciais | Ênfase |
|---|---|---|
| Geral | Outro / diversificado | Equilíbrio financeiro transversal |
| Serviços | Serviços profissionais, tecnologia, saúde, educação, hotelaria | Margem, rentabilidade e conversão operacional |
| Comércio e Distribuição | Retalho e grossista | Liquidez, inventário e rotação dos ativos |
| Operações Intensivas em Capital | Indústria, mineração, construção, transportes, agricultura e energia | Solvência, autonomia, dívida e retorno dos ativos |
| Serviços Financeiros (piloto) | Serviços financeiros | Referência financeira não regulatória |

## Fluxo

1. O cliente escolhe setor e descreve o core business ao criar a empresa após pagamento.
2. A API resolve o Industry Pack ativo e valida que os pesos totalizam exatamente 10.000 basis points (100%).
3. Para bundles com Finance/FP&A, cria framework, métricas e regras dentro da mesma transação de provisionamento.
4. Para empresa existente, o ecrã Metodologia permite aplicar ou trocar o pack com a mesma validação.
5. Cada operação produz audit event e histórico de instalação.

## Extensão segura

Novos packs devem ser adicionados por migração/configuração, possuir versão, estado de publicação, pesos determinísticos e testes. Métricas regulatórias ou locais devem viver em Country/Industry Packs específicos e nunca ser assumidas como universais.
