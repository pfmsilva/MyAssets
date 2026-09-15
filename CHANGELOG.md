# Histórico de versões

## 1.5.0 — 2026-09-15
- Orçamento: limite mensal por categoria de despesa, execução do mês com barras e marcador do dia, alertas (perto/acima do limite) também na visão geral, comparação com o mês anterior e com o mesmo mês do ano anterior.
- Rentabilidade real: TWR (Dietz modificado mensal encadeado) e XIRR por carteira e para o conjunto dos investimentos, para este ano, 1 ano, 3 anos e desde o início; fluxos de capital detetados nos movimentos (XTB, Optimize) ou nas transferências das contas à ordem, e fluxos manuais na página do ativo.

## 1.4.1 — 2026-09-15
- Relatório PDF cobre todos os ativos: inativos e sem valor registado, tabela "Detalhe por ativo" (registos, primeiro/último, variação a 12 meses, movimentos), composição de qualquer ativo com posições (incl. PPR Optimize) com preço médio, ganho/perda e mais-valias realizadas; membros sem ativos também listados.

## 1.4.0 — 2026-09-15
- Importador do extrato mensal Optimize (PDF): posições por subconta com quantidade, custo médio, cotação, valia e valorização; valor no fim do mês e valor do mês anterior (histórico); depósitos e subscrições como movimentos.
- Suporte a importadores assíncronos e a valores anteriores indicados nos ficheiros.

## 1.3.0 — 2026-09-15
- Ganho/perda XTB: custo de aquisição e preço médio por posição (do relatório), ganho/perda não realizado com o registo e em direto, por posição e total; coluna na visão geral.
- Mais-valias realizadas (folha "Closed Positions" da XTB): total, ano corrente e lista de posições fechadas na página do ativo.

## 1.2.0 — 2026-09-15
- Cotações em direto (Yahoo Finance) para as carteiras DEGIRO e XTB: valor em direto vs. último registo, variação do dia, preço atual por posição, com cache de 15 minutos e botão de atualização.
- Mapeamento automático ISIN/ticker → símbolo Yahoo, corrigível em Administração → Cotações; links diretos para a página Yahoo de cada instrumento.
- Cartão "Carteiras em direto" na visão geral.

## 1.1.0 — 2026-09-15
- Importador XTB (relatório de conta .xlsx): posições abertas agregadas por ticker + saldo em dinheiro calculado a partir das operações de caixa; operações (depósitos, compras, vendas, dividendos, impostos, juros) importadas como movimentos, sem duplicar (ID XTB).
- Análise de despesas passa a considerar apenas contas à ordem (operações de corretoras não contam como despesa).
- Regras de categorização para operações XTB (dividendos, juros, impostos, compras/vendas, transferências).

## 1.0.0 — 2026-09-15
- Aplicação Pecúlio: património da família com login Google e perfis Administração / Atualização / Consulta.
- Importação de extratos BPI (.xlsx), Revolut (.csv), Banco CTT (.xlsx, com saldo atual opcional) e carteira DEGIRO (.xls); movimentos repetidos ignorados; saldos de fim de mês derivados do histórico.
- Registo manual de valores e posições (PPR, XTB, Binance, dinheiro).
- Dashboards: visão geral, família (titularidade em %), ativos, evolução, despesas por categoria, rendimentos vs despesas, poupança (duas métricas), movimentos com categorização e regras.
- Visibilidade por membro: utilizadores não administradores só veem os membros/ativos associados.
- Relatório PDF do património da família (administrador).
- Registo de atividade dos utilizadores consultável na administração.
- Referência de versão (versão, commit, data de build) na aplicação.
