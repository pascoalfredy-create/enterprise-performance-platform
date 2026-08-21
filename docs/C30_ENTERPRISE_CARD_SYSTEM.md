# C30 — Enterprise Card System

## Objetivo

Uniformizar cartões, KPIs e painéis de todos os módulos sem transformar a plataforma num template administrativo genérico.

## Sistema visual

- Raio base de 16 px, padding de 20 px, gap de 16 px e borda neutra única.
- Sombra discreta e elevação mínima apenas em hover disponível.
- KPIs com altura mínima, grelha interna estável e alinhamento consistente entre rótulo, valor e contexto.
- Cabeçalhos de cartões com altura, separador, ação e truncamento previsíveis.
- Linhas operacionais com altura mínima e conteúdo protegido contra overflow.

## Responsividade

As grelhas usam colunas fluidas com largura mínima de 205 px, reduzem para duas colunas em tablet e uma coluna em ecrãs pequenos. Padding, gap e raio diminuem de forma coordenada no mobile.

## Governança

`enterprise-layout.css` é global e usa tokens. Novos módulos herdam automaticamente a geometria, mas podem acrescentar semântica visual — risco, favorável, atenção — sem alterar dimensões base.
