# Leitor de Faturas

Página única (HTML) que lê as faturas do cartão de crédito e os seus lançamentos de Pix e boletos, organiza tudo por categoria e mostra como você está no método 50/30/20.

Roda inteira no navegador: os arquivos são lidos no seu computador e **nada é enviado para servidor nenhum**.

## Como funciona

1. Abra o `index.html` no **Chrome ou Edge do computador** (ou pelo GitHub Pages, veja abaixo).
2. Na primeira tela, clique em **Conectar pasta** e escolha a pasta onde estão as faturas.
3. O leitor lê todos os arquivos da pasta (e das subpastas) e grava as suas alterações no arquivo **`leitor-faturas-dados.json` dentro dessa mesma pasta**.
4. Da próxima vez, é só abrir de novo e clicar em **Reconectar a pasta**. Faturas novas colocadas na pasta entram sozinhas.

Tudo o que você muda fica nesse JSON: categorias corrigidas, regras aprendidas, lançamentos manuais, datas de fechamento e vencimento dos cartões, subcategorias novas e metas.
Se a pasta estiver dentro do **Google Drive para computador** (ou OneDrive, Dropbox), o JSON sincroniza junto e você continua de outro computador.

## O que ele lê

- **CSV** de qualquer banco (reconhece o cabeçalho sozinho; testado com Nubank, C6 e Mercado Pago)
- **Excel** (`.xlsx`, `.xls`)
- **PDF** de fatura (Mercado Pago e layouts parecidos)
- Uma **planilha com a aba `Cadastros`** (opcional) para usar as suas próprias categorias e palavras-chave

## Recursos

- Resumo do mês com entradas, saídas, sobra e o painel **50/30/20**
- Fatura por cartão, respeitando o dia de fechamento e de vencimento
- Parcelas futuras projetadas nos meses seguintes
- Reclassificação que **aprende**: corrigiu uma loja uma vez, as próximas compras vêm certas
- Lançamentos manuais (Pix, boletos, salário) numa tabela de preencher
- Aba **Dados** para cartões, subcategorias (criar, renomear, mover, ocultar) e regras
- Layout para celular e computador

## Publicar no GitHub Pages

1. Crie um repositório e envie estes arquivos.
2. Em **Settings → Pages**, escolha a branch `main` e a pasta `/ (root)`.
3. Acesse o endereço gerado no Chrome ou Edge do computador.

> No celular e no Safari/Firefox os navegadores não permitem conectar pastas. Nesses casos o leitor oferece **Escolher arquivos** e guarda os dados só naquele navegador (use **Salvar JSON** / **Abrir JSON** para levar de um lugar para outro).

## Privacidade

- Não coloque suas faturas nem o `leitor-faturas-dados.json` no repositório. O `.gitignore` já bloqueia CSV, PDF, Excel e o JSON de dados.
- A página carrega apenas bibliotecas públicas de CDN: [SheetJS](https://sheetjs.com) (Excel), [pdf.js](https://mozilla.github.io/pdf.js/) (PDF) e fontes do Google Fonts.
