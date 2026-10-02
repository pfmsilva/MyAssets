# Histórico de versões

## 1.28.0 — 2026-10-02
- Testes automáticos (`npm test`, Vitest): 96 testes sobre os cálculos que sustentam a aplicação — XIRR, TWR e ganho por período, custo médio das carteiras de ações, barras diárias/semanais e o ganho de hoje igual às cotações, importadores (DEGIRO, Binance, deteção automática), regras de categorias, orçamento, permissões por membro, horários do resumo, notificações e o código de ligação do Telegram. Os testes de integração correm numa base de dados real e limpam-se a si próprios; sem `DATABASE_URL` são ignorados.
- Verificação automática no GitHub (CI) em cada push e pull request: tipos, lint, testes com Postgres e build. `CLAUDE.md` passa a incluir `npm test` antes de cada commit.
- Nova página Administração → Qualidade com verificações de coerência dos dados: total do registo que não bate com a soma das posições, movimentos importados duas vezes, operações repetidas, posições sem custo de aquisição ou com ganho suspeito (acima de 1 000 %), saltos grandes entre registos, registos com data no futuro, vendas de mais ações do que as compradas e despesas sem categoria.
- A vigilância passa a incluir a qualidade dos dados: os administradores recebem um aviso quando surge um aviso novo (e no /estado do Telegram).

## 1.27.0 — 2026-10-02
- Notificações na app: em "A minha conta" cada pessoa ativa as notificações push em cada dispositivo (browser ou aplicação instalada) e recebe os resumos e alertas mesmo com a aplicação fechada. No iPhone/iPad é preciso adicionar a aplicação ao ecrã principal (iOS 16.4 ou mais recente). A notificação mostra só ganhos e perdas, nunca o valor do património. Sem custos e sem configuração: as chaves de envio são geradas pela própria aplicação.
- Novo sino com o número de notificações por ler, no menu lateral e no cabeçalho do telemóvel, e a página "Notificações" com o histórico dos últimos 30 dias, incluindo a imagem dos gráficos dos resumos.
- Os horários do resumo ganham a coluna "App", ao lado de e-mail e Telegram. O resumo geral do fim do dia, os alertas e os avisos da vigilância também chegam à app (para os administradores, no caso dos alertas e avisos), desligável em Definições → Telegram.
- Dispositivos que deixem de receber notificações (desinstalados ou revogados) são esquecidos automaticamente. Cabeçalho móvel mais compacto.

## 1.26.2 — 2026-10-02
- Telegram: a imagem dos gráficos (resumo, /resumo, /semana e /mes) passa a indicar em rodapé a data e a hora das cotações do Yahoo Finance usadas.

## 1.26.1 — 2026-10-02
- Horários do resumo mais fiáveis: se o envio para o Telegram falhar (ou a preparação do resumo der erro), o horário volta a ser tentado no despertador seguinte, até 3 vezes, em vez de se perder.
- As tarefas das 07:00 e 21:30 UTC tratam primeiro dos horários pessoais, antes do trabalho mais demorado que podia esgotar o tempo limite.
- "A minha conta" mostra os últimos envios agendados (hora, atraso, canal, enviado ou porque falhou) e se o despertador da aplicação está a funcionar; cada envio fica também no registo de atividade.

## 1.26.0 — 2026-09-30
- Horários do resumo por utilizador: em "A minha conta" cada pessoa escolhe até quatro horas por dia (hora de Lisboa) para receber o resumo das carteiras e, em cada uma, se chega por e-mail, por Telegram ou pelos dois, só nos dias úteis ou todos os dias. Botões para testar por e-mail e no Telegram.
- Quem tiver horários próprios deixa de receber o resumo geral do fim do dia. Cada horário sai uma vez por dia (até 3 horas depois da hora marcada, se a aplicação só acordar mais tarde); ao guardar depois da hora, o horário desse dia não é enviado atrasado; num grupo da família com a mesma hora chega uma só mensagem.
- Novo endereço /api/cron/schedule (protegido com CRON_SECRET) para um "despertador" externo chamar a cada 5–15 minutos (por exemplo cron-job.org, grátis). As tarefas das 07:00 e 21:30 UTC e as visitas à aplicação também enviam os horários devidos. Instruções e estado em Administração → Definições → Resumo diário; a vigilância avisa se houver horários sem despertador.

## 1.25.0 — 2026-09-29
- Vigilância da plataforma: cada tarefa agendada (07:00 e 21:30 UTC) verifica a outra, as cotações do Yahoo Finance (pede cotações novas), as posições sem símbolo ou com cotação parada há mais de 7 dias, os erros dos últimos envios e o bot do Telegram.
- Se algo falhar, os administradores recebem um aviso no Telegram (ou por e-mail, se nenhum tiver o Telegram ligado): logo que o problema aparece, de novo a cada 24 horas enquanto for um erro, e uma mensagem "Resolvido" quando volta a funcionar.
- Se nenhuma das tarefas correr, a primeira visita de um administrador (no máximo a cada 6 horas) faz a verificação e envia o aviso.
- Uma tarefa que falhe a meio passa a deixar registo do erro em vez de desaparecer sem rasto.
- Novo cartão "Vigilância" em Administração → Definições com o estado de cada verificação e o botão "Verificar agora"; opção para desligar os avisos. No Telegram, /estado mostra o mesmo aos administradores.

## 1.24.0 — 2026-09-29
- Novos comandos do bot do Telegram, com a vista da conta ligada (num grupo, a do administrador):
  - /carteira: hoje e ganho desde o início de cada carteira; /carteira xtb (ou tocar em /carteira_xtb) mostra as posições com a variação do dia, o ganho e a hora das cotações.
  - /ativo aapl (ticker, nome ou ISIN): cotação, variação do dia e, em cada carteira onde o tem, o ganho de hoje e o ganho total; se não o tiver, mostra só a cotação.
  - /semana e /mes: gráfico da variação e do ganho acumulado das últimas 8 semanas ou dos últimos 12 meses, com a melhor e a pior.
  - /orcamento: gastos do mês por categoria face ao orçamento, o que falta ou quanto passou, o mês anterior e a projeção para o fim do mês.
- Em conversa privada os comandos também funcionam sem "/" (por exemplo "carteira xtb"); /ajuda lista tudo e o menu "/" do bot é atualizado.
- Valores das carteiras, quantidades e preços médios só aparecem se "Mostrar no Telegram também o valor das carteiras" estiver ligado em Definições; por omissão só ganhos, perdas e percentagens.

## 1.23.0 — 2026-09-29
- Telegram: enviar /resumo ao bot (ou escolher no menu "/") devolve em poucos segundos o resumo do momento, com os gráficos dos últimos 7 dias e o ganho de hoje por carteira às cotações atuais. Funciona na conversa privada e no grupo da família ligado; num grupo ligado por várias pessoas mostra a vista do administrador.
- Pedidos repetidos em menos de 30 segundos são ignorados, e os resumos pedidos (no Telegram ou pelos botões da aplicação) já não contam como o resumo automático do fim do dia, que continua a chegar.
- O bot passa a mostrar o menu de comandos (/resumo, /sair) e a responder a /ajuda.

## 1.22.2 — 2026-09-29
- Ligar Telegram: depois de carregar em Iniciar no Telegram, "A minha conta" passa a mostrar sozinha que ficou ligado (verifica a cada 3 segundos); o botão "Atualizar" passa a "Verificar agora" e, se ainda não estiver ligado, diz porquê segundo o próprio Telegram (por exemplo, a aplicação a recusar as mensagens por causa da proteção de acesso do Vercel, ou um endereço errado em APP_URL).
- O endereço do webhook é corrigido quando APP_URL tem "/" no fim ou não tem "https://", casos em que o Telegram não conseguia entregar as mensagens.

## 1.22.1 — 2026-09-29
- Telegram: o token do bot é aceite mesmo quando colado no Vercel com espaços, aspas, quebras de linha, o prefixo "bot" ou a mensagem inteira do @BotFather.
- Quando o Telegram recusa o token ("Unauthorized"), a mensagem passa a explicar como o voltar a copiar.

## 1.22.0 — 2026-09-29
- Ligação ao Telegram: em "A minha conta" cada pessoa liga a sua conta (ou um grupo da família) ao bot do Pecúlio com um link válido 24 horas; "/sair" no Telegram ou "Desligar" na aplicação desfazem a ligação.
- O resumo do fim do dia chega ao Telegram como uma imagem com os gráficos da variação por dia e do ganho acumulado dos últimos 7 dias, e o ganho de hoje por carteira na legenda.
- Alertas e prova de vida podem seguir por Telegram; o relatório PDF pode seguir aos administradores à segunda-feira.
- Em Administração → Definições → Telegram escolhe-se, para cada envio, só e-mail, só Telegram ou os dois. Por omissão o Telegram não mostra o valor das carteiras, só ganhos e perdas.
- Requer `TELEGRAM_BOT_TOKEN` (criado em @BotFather) e `APP_URL` no Vercel.

## 1.21.1 — 2026-09-29
- Resumo diário por e-mail: o ganho acumulado dos 7 dias passa a ser um gráfico de linha com área sombreada, igual ao da secção de Investimentos (verde se positivo, vermelho se negativo), embutido no e-mail como imagem; as datas e os valores ficam por baixo, alinhados com cada ponto.

## 1.21.0 — 2026-09-29
- Novo resumo diário por e-mail no fim do dia (cerca das 22h30 de Lisboa, depois do fecho dos mercados americanos): variação por dia e ganho acumulado dos últimos 7 dias das carteiras com cotação, em gráficos de barras, com a tabela dia a dia, o valor em direto e o ganho de hoje de cada carteira.
- Cada utilizador recebe só as carteiras que pode ver na aplicação. Em Administração → Definições escolhe-se enviar a ninguém, só aos administradores ou a todos, e se também ao fim de semana; o botão "Enviar-me o resumo de hoje" mostra como fica.
- Os gráficos são feitos com tabelas HTML, para aparecerem no Gmail, Outlook e telemóvel sem depender de imagens; cada utilizador recebe no máximo um resumo por dia.

## 1.20.1 — 2026-09-29
- Ganhos e perdas: a barra de hoje passa a ser exatamente a variação do dia das cotações (igual à coluna "Hoje" e ao indicador). Antes comparava o valor em direto com o último registo guardado, que podia ser o fecho de dois dias antes ou um valor tirado a meio do dia; essa diferença passa para a barra de ontem.
- O valor diário gravado pela tarefa das 07:00 UTC (antes da abertura dos mercados) passa a ficar com a data de ontem, porque corresponde ao fecho de ontem; um valor gravado durante o dia com "Atualizar tudo" é substituído pelo fecho na manhã seguinte.

## 1.20.0 — 2026-09-26
- Relatório PDF completo, com índice na primeira página e novas secções: valor em direto com a hora das cotações, investimentos em direto por carteira, rentabilidade (ganho, TWR e XIRR por carteira e global), ganhos e perdas (barras diárias dos últimos 30 dias e semanais dos últimos 6 meses), mais-valias realizadas (incluindo as carteiras de ações manuais, com execuções parciais agrupadas), despesas mês a mês, orçamento do mês e notas de metodologia.
- A última análise de IA passa a fazer parte do relatório, numa página própria: resumo, observações, riscos e sugestões com a respetiva prioridade, perguntas a responder e o aviso de que não é aconselhamento financeiro.
- Caracteres que as fontes do PDF não suportam (por exemplo "−", "→" ou "≈" no texto da IA) passam a ser convertidos em vez de aparecerem trocados.

## 1.19.0 — 2026-09-26
- A lista por membro da família passa a ser uma vista da página de ativos ("ver por: ativo / membro"); `/membros` reencaminha para lá e as fichas de cada membro mantêm-se.
- As três secções de Investimentos (ganhos e rentabilidade, alocação-alvo, análise de IA) passam a partilhar o mesmo resumo de topo — investimentos, valor em direto, ganho de hoje e ganho desde o início — deixando de repetir indicadores diferentes em cada uma.
- Administração → Definições reorganizada em secções que se abrem, cada uma com o estado resumido numa linha (registo de atividade, alertas, backup e valor diário, prova de vida, análise de IA).

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
