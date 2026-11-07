# Leitor de Faturas — instruções para o Claude Code

App de finanças pessoais em **um único HTML** que roda no navegador: lê faturas de cartão (CSV, Excel, PDF) de uma pasta do computador, categoriza, mostra resumo e o método 50/30/20, e grava tudo em `leitor-faturas-dados.json` **dentro da própria pasta escolhida**. Nada vai para servidor.

O dono do projeto é professor, fala português do Brasil e usa muito pelo **celular**. Toda a interface, mensagens e commits são em **pt-BR**, com linguagem simples (sem jargão técnico na UI).

Histórico completo de decisões: `docs/HISTORICO.md`. Leia antes de mudar comportamento.

## Estrutura

```
src/template.html   HTML + CSS + núcleo de leitura (parse de CSV, datas, valores, categorização, regra do mês da fatura)
src/app.js          Interface e estado (pasta, abas, tabelas, metas, Dados, regras aprendidas)
src/pdf-lines.js    Converte texto do PDF (pdf.js) em linhas CSV
data/defaults.json  Categorias, subcategorias e palavras-chave genéricas (sem dados pessoais)
build.py            Junta tudo em index.html
index.html          Arquivo gerado (é o que o GitHub Pages publica) — não edite à mão
app/                Ícones e manifest do aplicativo instalável (PWA)
sw.js               Service worker: guarda a página e as bibliotecas para abrir sem internet
tests/smoke.js      Teste de ponta a ponta com Playwright (pasta simulada + fixtures)
tests/fixtures/     Faturas FALSAS de exemplo (Nubank e C6)
```

## Fluxo de trabalho

1. Edite `src/*` (nunca o `index.html` direto).
2. `python3 build.py` para gerar o `index.html`.
3. `npm install` (primeira vez) e `npm test` (no ambiente do Claude na nuvem: `CHROME_PATH=/opt/pw-browsers/chromium npm test`) — precisa passar no computador **e** no celular (390px).
4. A cada mudança visível para o usuário, **aumente `VERSAO`** no topo de `src/app.js` (ex.: 1.2 → 1.3) e a `version` do `package.json`. O selo "v1.x" aparece ao lado do título.
5. Commit em pt-BR descrevendo o que muda para o usuário. Pode fazer push direto na `main` (o usuário pediu alterações direto no GitHub).

Versão pessoal (com as categorias e dados do dono): `python3 build.py --data private/dados-pessoais.json --out private/leitor-pessoal.html`. A pasta `private/` está no `.gitignore`.

## Regras que não podem quebrar

- **Nunca** colocar dados pessoais no repositório: faturas, nomes, finais de cartão reais, valores, o JSON de dados. O `.gitignore` bloqueia `*.csv`, `*.pdf`, `*.xlsx`, `leitor-faturas-dados.json` e `private/` (exceto `tests/fixtures/`).
- Saída sempre **um HTML autocontido** (os arquivos `app/` e `sw.js` só servem para instalar como aplicativo pelo GitHub Pages; sem eles o HTML funciona igual). Bibliotecas só via CDN fixa: SheetJS `xlsx@0.18.5` e `pdf.js@3.11.174` (cdnjs), fontes do Google Fonts.
- Conectar pasta usa a File System Access API (`showDirectoryPicker`): só Chrome/Edge no computador e fora de iframe. Em celular/iframe o app cai para **Escolher arquivos** + `localStorage`.
- Layout tem que funcionar em 390px sem rolagem lateral da página (tabelas largas rolam dentro de `.sheet`).

## Conceitos do domínio

- **Mês da fatura** (`computeMonths` em template.html): `m = mês(data) + (parcData==="S" ? n-1 : 0) + (fech && dia>=fech ? 1 : 0) + (fech && venc && venc<fech ? 1 : 0)`. Compra conta no mês em que a fatura **vence**. Ex.: Nubank fecha dia 11 → compras de 11/09 a 10/10 caem em outubro. **Quando o nome do arquivo traz a data de vencimento** (`fileVenc`, ex.: `Fatura_2026-10-10.csv`), todas as linhas do arquivo usam esse mês (`it.mFat`) e a fórmula acima é ignorada: a fatura é a fonte da verdade.
- **Parcelas futuras**: parcela n/N é projetada até `m+(N-n)` (campo `mEnd`), a menos que exista uma parcela posterior da mesma compra em outro arquivo.
- **Parcela na descrição**: "Parcela n/N" ou final " - n/N" (ex.: Nubank "Pix no Crédito … - 11/12").
- **parcData**: "S" quando a data do CSV é a da compra original (C6, Mercado Pago); "N" quando já é a data da parcela (Nubank).
- **Pagamentos** (valor negativo + "pagamento") são ignorados (`ign`).
- **Estornos** (`matchEstornos` em template.html, roda no fim do `build()`): todo valor negativo que não é pagamento procura a compra do mesmo banco, loja parecida (`estSim`), até 200 dias antes. Mesmo valor (ou soma das parcelas da mesma loja) → os dois ficam `ign` com `est="total"` (zerados). "Reversão do crédito de confiança" (+) anula o "Crédito de confiança" (−). Valor menor → `est="parcial"`, o crédito vai para o mês/categoria da compra. Sem compra → `est="sem"` (continua abatendo). Aviso azul `#estBar` no Resumo/Cartões; filtro "Estornos"; botão "Não é estorno" grava `edicoes[id].naoEst`.
- **Cartão** = chave `"Banco|final"` (ex.: `"Nubank|"` quando o arquivo não traz o final). O usuário pode dar o final por arquivo (`state.arqFinal`), apelido, dia de fechamento/vencimento e "Quem paga" (`terceiro` → tudo fora da conta).
- **Categorização** (`categorize`): regras aprendidas do usuário (`state.regras`, a mais longa ganha) → palavras-chave (`cfg.kw`, a última que casa ganha) → palpite por tokens parecidos (`learnGuess`) → "Outros (Gerais)". Cada item guarda `how`: regra | palavra | palpite | padrao.
- **Aprender**: trocar a categoria de uma compra cria/atualiza regra pela loja (`merchant()` → `learnRule`) e aplica às compras iguais; "Só esta compra" desfaz a regra.
- **50/30/20**: grupos `nec` (necessidades), `des` (desejos), `pou` (poupança e dívidas). Poupança inclui o que sobrou do mês. Base = entradas do mês ou renda informada. Grupo por subcategoria (`grpOf`): mapa do usuário → grupo da subcategoria nova → `DEF_SUB` → grupo da categoria.

## Estado (`state`, salvo no JSON da pasta e no localStorage `lf3-state`)

`versao, cfg (da planilha, opcional), cartoes{chave:{alias,fech,venc,terceiro,manual?}}, arquivos[{nome,origem,text|rows,colMode,mod,size,manual?}], edicoes{idItem:{cat,sub,ign,val,desc,mes,card,naoEst}}, manuais[{id,date,desc,tipo,cat,sub,meio,val,parc,origem,pAt?,mesP?}] (meio com "|" = cartão: conta na fatura dele; pAt/mesP = compra antiga, parcela pAt cai no mês mesP), regras[{k,t,ex,em}], extras{subs[{nome,cat,grp,kw,user?}],del[],mov{},ren{}}, metas{pct{nec,des,pou},renda,map}, invest[{id,nome,tipo,inst,v{mês:valor}}] (investimentos digitados à mão; mês sem valor repete o último informado, `ivAt`), arqFinal{arquivo:final}, planMod, pasta, seed`

- PIN fica fora do `state`: localStorage `lf-pin` ({salt,hash,min}), por aparelho.
- Arquivos que saem da pasta saem da conta (exceto os escolhidos à mão, `manual:true`).
- A pasta é relida ao voltar para a janela e a cada 60s (`autoScan`, silencioso).
- Ao conectar uma pasta sem JSON, as configurações já feitas no navegador vão junto.

## Abas

Resumo (cards Entradas, Saídas, Diferença e Orçamento comprometido = soma de tudo que já cai nos meses seguintes até a última parcela, `#kCom`; 50/30/20 clicável por grupo, rosca + para onde foi com subcategorias recolhidas (toque na categoria abre; "Abrir todas"; `catsAbertas`), gráfico mês a mês com barras de entradas (verde) e gastos, comprometido, valores nas barras e média (só com 2+ meses) em `mesesChart`, como foi pago, já comprometido, **Meus investimentos** (`rInv`: total, variação, aportes = lançamentos do grupo poupança exceto dívidas, rendimento estimado, evolução e por tipo), e no fim **Onde dá para economizar** (`rDiag`/`diagCalc`): botão Rodar diagnóstico → resumo "dá para sobrar até R$ X", quando a renda libera (fim das parcelas), o que subiu x média de 3 meses, desejos x meta, gastos pequenos repetidos, assinaturas, gastos evitáveis e simulador (`lf-sim` no localStorage). Habitação/Saúde/Educação e poupança/dívidas não recebem sugestão de corte (`dgNivel`)) · Cartões (escolher cartões, tabela de compras com categoria — zerados por estorno ficam escondidos em "Todas" (`cZerShow`), "Eu pago", valor editável = "sua parte", ✓ para confirmar palpites) · **+ Lançar** (tabela estilo planilha; linha verde vira lançamento; quadro recolhível `#lAjudaBox` com ajuda: o que falta, categoria prevista, aviso de data fora do mês, sugestões do que foi lançado no mês anterior e último valor da mesma descrição — `lAjuda`, `lLembrar`, `lRecorrentes`) · Análise (categoria → subcategoria, lojas, tendência) · Dados (alertas de preenchimento, cartões, categorias/subcategorias, regras aprendidas, pasta e arquivos).

## Testar sem internet

O `tests/smoke.js` usa `xlsx` e `pdfjs-dist` do `node_modules` no lugar da CDN. Para PDF real, coloque um arquivo em `private/` e teste manualmente; não versione.
