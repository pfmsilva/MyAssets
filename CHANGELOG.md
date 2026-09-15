# Histórico de versões

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
