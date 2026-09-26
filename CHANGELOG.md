# Histórico de versões

## 1.18.0 — 2026-09-26
- Importação sem escolher o formato: o ficheiro é reconhecido pelo conteúdo (BPI, Revolut, Banco CTT, carteira e transações DEGIRO, Binance, XTB e Optimize) e só é preciso escolher à mão se não for reconhecido. O resultado diz qual o formato detetado.
- Novo botão "Atualizar tudo" na visão geral e na página de cada carteira: refresca as cotações, recalcula as carteiras de ações e regista o valor do dia, substituindo os vários botões separados.

## 1.17.1 — 2026-09-26
- Arrumação interna sem alterações visíveis: as séries do património passam a ser construídas num único módulo (`asset-series`), partilhado pela evolução, pela rentabilidade e pelos ganhos diários.
- As cotações em direto são calculadas uma só vez por pedido, em vez de uma vez por secção da página.
- Filtros de período e agrupamento passam a usar um componente comum.

## 1.17.0 — 2026-09-26
- Menu simplificado de onze para seis entradas: Visão geral, Património (ativos, família, evolução), Gastos (despesas e orçamento, movimentos), Investimentos (ganhos e rentabilidade, alocação, análise de IA), Importar e Administração. As páginas de cada área aparecem como separadores no topo.
- O orçamento passa a fazer parte da página de despesas, com o seu seletor de mês, execução por categoria e limites editáveis; `/orcamento` reencaminha para a nova secção e as ligações antigas continuam a funcionar.
- Barra inferior em telemóvel com as quatro áreas principais.

## 1.16.0 — 2026-09-26
- Ganhos e perdas: novo período "7 dias", consolidação por dia, semana, mês ou ano, e filtro "só com cotação" que mostra exatamente as carteiras do cartão "Carteiras em direto" da visão geral.
- Os indicadores e os eixos acompanham a consolidação escolhida (melhor/pior dia, semana, mês ou ano) e a barra que inclui o valor em direto continua tracejada.
- Visão geral: o cartão das carteiras em direto passa a mostrar a data e a hora das cotações do Yahoo Finance.

## 1.15.1 — 2026-09-26
- A tabela dos ganhos diários passa a separar "último registo" de "em direto" e a marcar as carteiras sem cotação, ficando o total em direto igual ao do cartão "Carteiras em direto" da visão geral (que lista apenas as carteiras com cotação).

## 1.15.0 — 2026-09-25
- Novos gráficos em Rentabilidade: variação diária (barras verdes/vermelhas) e ganho acumulado das carteiras cotadas em direto, com seletor de período (30 dias, 90 dias, 6 meses, 1 ano, tudo).
- Cada barra é a diferença de valor entre registos consecutivos, descontando depósitos e levantamentos do dia; a última barra, tracejada, é o dia de hoje às cotações do momento (fica de fora do melhor/pior dia por ser parcial).
- Indicadores de hoje, acumulado, melhor e pior dia, e tabela por carteira com o valor em direto, o ganho de hoje e o do período; ligação a partir do cartão "Carteiras em direto" da visão geral.
- Os valores grandes nos cartões de indicadores deixam de provocar deslocamento horizontal em ecrãs pequenos.

## 1.14.0 — 2026-09-21
- O importador da Binance aceita agora ficheiros com os símbolos do Yahoo por moeda (par em euros e par em dólares) e sem coluna de valor: o valor de cada posição é calculado na importação com a cotação do momento, usando o par em dólares ao câmbio quando não há par em euros.
- Os símbolos indicados no ficheiro são respeitados (ex.: SUI20947-EUR, S3-USD), o que resolve as moedas que o Yahoo renomeia; sem cotação, fica o valor de compra e um aviso.
- O formato anterior (com valor atual em EUR) continua a ser aceite.

## 1.13.1 — 2026-09-21
- As posições de criptomoedas passam a ser cotadas só contra criptomoedas no Yahoo: nunca são confundidas com ações do mesmo ticker (SAND, LINK, S, …).
- Procura o par em euros (BTC-EUR) e, se não existir, o par em dólares convertido ao câmbio; moedas que o Yahoo renomeia são encontradas por pesquisa limitada a criptomoedas, e quando não há cotação a mensagem explica como indicar o símbolo à mão.
- Os instrumentos criados a partir de pares de cripto ficam logo com a classe "Criptomoedas" para a alocação-alvo.

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
