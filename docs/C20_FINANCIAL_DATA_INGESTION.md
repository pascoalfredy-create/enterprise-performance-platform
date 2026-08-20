# C20 — Dados Financeiros, Catálogo e Mappings

## Objetivo

Receber Actual de qualquer ERP, ficheiro ou plano de contas sem introduzir convenções de país ou setor no Core.

## Fluxo

1. Configurar catálogo financeiro normalizado e tratamento do sinal.
2. Mapear cada código do sistema de origem para uma linha e dimensão opcional.
3. Carregar lote de 1 a 5.000 linhas com período, moeda, organização e origem.
4. Validar que todos os códigos possuem mapping ativo.
5. Um utilizador independente publica o lote no cenário `Actual`.

Lotes, linhas, valores e hashes são imutáveis. A chave de idempotência inclui organização, período, moeda, origem e hash integral dos inputs. Cada lançamento publicado conserva `Import:<batch_id>` como origem para drill-through.
