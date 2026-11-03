# Histórico do projeto

Resumo das conversas que deram origem ao Leitor de Faturas, em ordem. Serve para entender **por que** as coisas são como são.

## Fase 1 — Planilha "Finanças" (Excel)

- Ponto de partida: uma planilha pessoal de controle financeiro, preenchida colando o CSV das faturas.
- Pedidos e decisões:
  - Respeitar o **dia de fechamento** de cada cartão: compra a partir do dia do fechamento vai para a fatura seguinte. O mês mostrado é o do **vencimento**.
  - A mesma regra vale para lançamentos manuais.
  - **Parcelas** entram como gasto nos meses seguintes (projeção).
  - Cartões cadastrados automaticamente pelo final (ex.: "C6 1234"), com **apelido**.
  - Leitor genérico de CSV de qualquer banco pelo cabeçalho (inclui CSV com datas em número serial do Excel e acentos quebrados "Ã§").
  - PDF do Mercado Pago.
  - Toda **saída é despesa e toda entrada é receita**, inclusive Pix (coluna Entrada/Saída nos lançamentos).
  - Planilha com o mínimo possível de fórmulas; foi remodelada com aba Faturas única, Painel e Ano.

## Fase 2 — HTML "Leitor de Faturas"

Em ordem de pedido:

1. HTML que lê as faturas de uma **pasta conectada**, incluindo a planilha (categorias, subcategorias e palavras-chave vêm da aba Cadastros) e grava um **JSON na mesma pasta**.
2. Ler **PDF**; permitir **adicionar e modificar** lançamentos, salvos no JSON.
3. Visual mais claro; ver **categoria → subcategoria** (ex.: Transporte → Uber/99); aba de **lançamento manual** (Pix, boletos) aberta depois de carregar as faturas; abas **Resumo**, **Análise** e **Cartões** (um cartão ou todos).
4. Layout **responsivo** e capa de entrada estilo vidro → depois o vidro passou a valer para tudo → depois **sem degradê** (fundo claro liso).
5. **Reclassificar** compras e o sistema **aprender** (regras por loja + palpite por lojas parecidas; filtro "A revisar"; ✓ para confirmar).
6. **Metas 50/30/20** no Resumo e na capa, com grupos clicáveis que abrem os gastos de cada grupo. "Ajustar metas" muda percentuais, renda base e o grupo de cada categoria/subcategoria.
7. Pesquisa de **subcategorias novas** (Aluguel, Óculos e Lentes, Cursos Online, Viagens, Eletrônicos, Softwares e IA etc.) e aba **Dados** para configurar: criar/renomear/mover/ocultar subcategorias, datas dos cartões com **alerta de preenchimento** (selo vermelho na aba e aviso amarelo).
8. Botão **+ Lançar** no centro da barra (círculo verde no celular); visual mais limpo; aba Pasta incorporada à aba Dados.
9. Conexão com Google Drive: o Drive (site/app) não executa HTML; precisa do **Google Drive para computador** + Chrome/Edge. Correções: reler a pasta sozinho (ao voltar para a janela e a cada minuto) e tirar da conta arquivos apagados.
10. **Primeira tela pede para conectar a pasta** e **tela de carregando** com progresso por arquivo.
11. Celular com botões embolados → **tabelas de preenchimento** estilo planilha (Lançamentos e Compras da fatura), descrição fixa à esquerda, rolagem lateral só dentro da tabela.
12. Versão limpa para o **GitHub** (sem dados pessoais, categorias genéricas, README, .gitignore). Repositório: este.
13. Compras **não pagas por mim**: coluna "Eu pago", valor editável ("sua parte") e "Quem paga" por cartão (outra pessoa → fora da conta).
14. Quando a fatura não traz o número do cartão: mostrar o **nome do arquivo** e permitir informar o final por arquivo (vira cartão separado). Selo de **versão** ao lado do título.
15. **Estornos** (v1.3): o leitor acha cada estorno/crédito e a compra que ele devolve e zera os dois, com aviso no topo e filtro "Estornos" na aba Cartões. Ex. real: as 12 parcelas da Myhub.Ia foram devolvidas por um "Crédito de confiança" de R$ 838,80.
16. **Gráficos no Resumo** (v1.4): rosca dos gastos do mês ao lado de "Para onde foi o dinheiro" (agora com as subcategorias abertas) e gráfico "Gastos mês a mês" com as parcelas já comprometidas até a última, linha da média de gastos e linha das entradas.
17. **Valores que não batiam** (v1.5): (a) o mês vinha do dia de fechamento digitado, e compras do começo da fatura caíam no mês anterior quando o fechamento estava errado → agora a data de vencimento no nome do arquivo manda; (b) o final do cartão informado por arquivo se perdia ao conectar a pasta pela primeira vez; (c) "Pix no Crédito … - 11/12" do Nubank não era lido como parcela.

## Preferências do usuário (observadas)

- Usa muito no celular; quer tudo claro, limpo e sem botões amontoados.
- Prefere ver as mudanças publicadas e testadas, com explicação curta em português.
- Quer as alterações feitas direto no GitHub.

18. **Ajuda para preencher (v1.6)** — na aba + Lançar, um quadro que recolhe e expande mostra o que falta, a categoria que vai ser usada, avisa quando a data é de outro mês, sugere repetir o que foi lançado no mês anterior e completa tipo, categoria e meio quando a descrição já foi usada (com botão para lançar com o último valor). As descrições antigas aparecem como sugestão ao digitar.

19. **Cards do Resumo (v1.7)** — o quarto card deixou de ser "Comparado ao mês anterior" e virou "Orçamento comprometido": soma de todos os gastos já conhecidos dos meses seguintes (parcelas), até a última parcela. "Sobrou no mês" virou "Diferença".

20. **Subcategorias recolhidas (v1.8)** — em "Para onde foi o dinheiro" as subcategorias começam fechadas; tocar na categoria abre/fecha, "Abrir todas" abre tudo. Tocar numa subcategoria leva para a Análise.

21. **Revisão geral (v1.9)** — medido: o app redesenha qualquer aba em menos de 80 ms, então não havia lentidão real. Ajustes: linha de Entradas só nos meses com entrada (antes descia até zero); compras e estornos que se anularam ficam escondidos na lista "Todas" dos Cartões (linha "ver" leva ao filtro Estornos); explicação longa dos Cartões virou "Como corrigir e ensinar o leitor" recolhível; no celular, avisos mais compactos e nomes de categoria com mais espaço; barras da Análise mais finas; aviso quando o navegador não consegue salvar (memória cheia).

22. **Gráfico mês a mês (v2.0)** — vira "Entradas e gastos mês a mês": entradas em barra verde ao lado dos gastos, valores escritos em cima das barras (no celular só no mês escolhido quando não cabe), mês escolhido destacado, linha de média só com 2+ meses de fatura, e o detalhe ao tocar mostra a diferença.

## Ideias que ficaram em aberto

- Mover "Ajustar metas" do Resumo para a aba Dados (sugerido, sem resposta).
- Saber o que é a loja "Myhub" para fixar a categoria (perdeu urgência: as compras foram estornadas).
- Ligar o GitHub Pages (Settings → Pages → main) — depende do dono do repositório.
