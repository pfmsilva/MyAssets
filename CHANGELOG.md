# Histórico de versões

## 1.13.0 — 2026-09-21
- Novo importador Binance (CSV de ativos: código, quantidade, valor atual em EUR, ganho/perda e valor de compra estimado): regista cada moeda como posição na data indicada, com preço médio e custo de aquisição.
- As posições de cripto ficam ligadas às cotações do Yahoo pelo par em euros (BTC-EUR, ETH-EUR, …), pelo que a carteira passa a ter valor em direto, variação do dia e ganho/perda.
- O campo "data do retrato" passa a aparecer para todos os ficheiros sem data (DEGIRO e Binance).

## 1.12.2 — 2026-09-21
- Importar transações para um ativo que ainda não é carteira de ações passa a oferecer a conversão no próprio formulário (opção marcada por omissão), mantendo o histórico de valores; a mensagem de erro passa a dizer qual é o tipo atual e o que fazer.

## 1.12.1 — 2026-09-21
- Correção: o importador de transações é o da **DEGIRO** (Atividade → Transações → CSV), não da Revolut; formato e cálculos são os mesmos.

## 1.12.0 — 2026-09-21
- Importação das transações de investimento (CSV com uma linha por ordem executada): cada linha passa a ser uma compra ou venda numa carteira de ações, com a ação criada automaticamente a partir do ISIN.
- Quantidade, preço médio, custo de aquisição, mais-valias realizadas e valor ao momento (cotações Yahoo) calculados a partir das operações importadas; o valor da carteira é registado logo após a importação.
- Operações repetidas são ignoradas (identificador da ordem), pelo que o mesmo ficheiro pode ser importado vezes sem conta; anular a importação apaga as operações que criou.

## 1.11.0 — 2026-09-21
- Pesquisa global em toda a aplicação: páginas, membros, ativos, ações das carteiras, categorias, instrumentos/cotações e descrições e notas dos movimentos.
- Caixa de pesquisa na barra lateral e no topo em mobile, com atalho `Ctrl/⌘+K`, navegação pelas setas, resultados enquanto se escreve e página `/pesquisa` com todos os resultados agrupados.
- Os resultados respeitam o âmbito do utilizador (membros e ativos visíveis) e as páginas de administração só aparecem a administradores.

## 1.10.0 — 2026-09-21
- Análise de IA (Claude) do património: resumo, observações, riscos, sugestões de reequilíbrio face à alocação-alvo e perguntas a responder antes de decidir, em página própria com histórico das análises e custo estimado de cada uma.
- Todos os números são calculados pela aplicação e apenas interpretados pelo modelo; nunca são enviados movimentos, números de conta nem dados de acesso, e os nomes dos membros podem ir anonimizados.
- Ativação, anonimização e estado da chave em Administração → Definições; executar uma análise exige perfil de administração e fica no registo de atividade.

## 1.9.0 — 2026-09-21
- Alocação-alvo: repartição do património por classe de ativo (ações, obrigações, ouro, cripto, liquidez, imobiliário, fundos mistos), com peso-alvo por classe, tolerância configurável, desvio em pontos percentuais e o montante a comprar ou vender para voltar ao alvo.
- Sugestão de reequilíbrio só com dinheiro novo, sem vender nada, e o reforço total necessário.
- Classificação automática das posições pelo nome (ouro, obrigações, cripto, liquidez), corrigível por posição e guardada para todas as carteiras.
- Secção de alocação no relatório PDF; a composição das carteiras deixa de ser escondida pelo valor diário automático.

## 1.8.0 — 2026-09-21
- Prova de vida: de X em X dias é enviado um e-mail com um link de confirmação às pessoas indicadas; basta uma confirmar para o ciclo recomeçar.
- Se ninguém confirmar em Y dias, os acessos à aplicação são atribuídos automaticamente às pessoas definidas, que recebem o link e o relatório do património em PDF; os titulares são avisados por e-mail.
- Lembretes automáticos a 3 dias e a 1 dia do prazo, entrada de administrador como prova de vida (opcional), estado e histórico em Administração → Definições, com simulação e execução manual.

## 1.7.1 — 2026-09-19
- Visão geral: os cartões "Património total" e "Investimentos" mostram, em segundo plano, o valor às cotações do momento e a diferença face aos valores registados.

## 1.7.0 — 2026-09-19
- Novo tipo de ativo "Carteira de ações (manual)": lista de ações por ISIN e descrição, com cada compra e venda registada à mão (data, quantidade, valor pago e comissão).
- Valor da carteira calculado ao momento com as cotações do Yahoo Finance (quantidade × cotação, convertida para EUR), com preço médio, ganho/perda por ação e total, variação do dia e mais-valias realizadas nas vendas.
- Procura automática do símbolo Yahoo a partir do ISIN (editável por ação) e ligação direta à página do Yahoo.
- Botão para reconstruir o histórico mensal a partir das cotações históricas; atualização automática diária.

## 1.6.0 — 2026-09-15
- Backups e exportação: Excel com todas as tabelas e backup JSON completo (Administração → Definições); backup semanal por e-mail opcional.
- Retenção do registo de atividade configurável (dias), limpeza automática na tarefa diária e botão de limpeza imediata.
- Alertas por e-mail (Resend): ativos sem atualização, variação diária de carteira acima de um limiar, categorias acima do orçamento; destinatários e limiares configuráveis; e-mail de teste e simulação.
- Tarefa diária agendada (Vercel Cron) com relatório da última execução; registo diário opcional do valor em direto das carteiras.
- Ícone instalável: PNG 192/512, versões maskable e Apple touch icon; manifest com atalhos.

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
