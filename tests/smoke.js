// Teste rápido: abre o index.html num Chromium, conecta uma pasta simulada com as faturas de exemplo,
// confere a leitura, lança um Pix e verifica se o JSON foi gravado na pasta.
// Uso: npm install && npm test   (ou: node tests/smoke.js caminho/para/index.html)
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
const ROOT = path.join(__dirname, "..");
const HTML = process.argv[2] || path.join(ROOT, "index.html");
// usa as bibliotecas instaladas no node_modules em vez da CDN (funciona sem internet)
const local = {};
try { local["xlsx.full.min.js"] = require.resolve("xlsx/dist/xlsx.full.min.js"); } catch (e) {}
try { local["pdf.min.js"] = require.resolve("pdfjs-dist/build/pdf.min.js"); local["pdf.worker.min.js"] = require.resolve("pdfjs-dist/build/pdf.worker.min.js"); } catch (e) {}

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  let fails = 0; const ok = (c, msg) => { console.log((c ? "ok   " : "FALHA") + " " + msg); if (!c) fails++; };
  for (const [w, h, nome] of [[1280, 900, "computador"], [390, 844, "celular"]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const erros = []; page.on("pageerror", e => erros.push(e.message));
    await page.route("**/*", r => { const u = r.request().url(); for (const k in local) if (u.endsWith("/" + k)) return r.fulfill({ path: local[k], contentType: "application/javascript" }); return r.continue(); });
    await page.goto("file://" + HTML); await page.waitForTimeout(800);
    ok(await page.isVisible("#cvConn"), `${nome}: primeira tela pede para conectar a pasta`);
    const fx = {}; for (const f of fs.readdirSync(path.join(__dirname, "fixtures"))) fx[f] = fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
    const r = await page.evaluate(async (fx) => {
      const written = {};
      const files = Object.entries(fx).map(([n, t], i) => new File([t], n, { lastModified: 1000 + i }));
      const dir = { name: "Teste", async *values() { for (const f of files) yield { kind: "file", name: f.name, getFile: async () => f }; },
        async getFileHandle(n, o) { if (!o || !o.create) throw new Error("nf"); return { createWritable: async () => ({ write: async d => { written[n] = d; }, close: async () => {} }) }; } };
      window.showDirectoryPicker = async () => dir;
      document.getElementById("cvConn").click();
      await new Promise(r => setTimeout(r, 2500));
      const cards = ITEMS.filter(i => i.kind === "cartao");
      return { arquivos: state.arquivos.length, compras: cards.filter(i => !i.ign).length, pagamentos: cards.filter(i => i.ign && !i.est).length, estornos: cards.filter(i => i.est === "total").length,
        uber: (cards.find(i => /uber/i.test(i.desc)) || {}).sub, json: !!written["leitor-faturas-dados.json"], resumo: !document.getElementById("cvSummary").hidden };
    }, fx);
    ok(r.arquivos === 2, `${nome}: leu as 2 faturas (${r.arquivos})`);
    ok(r.compras === 8 && r.pagamentos === 2, `${nome}: 8 compras e 2 pagamentos ignorados (${r.compras}/${r.pagamentos})`);
    const nucleo = await page.evaluate(() => ({ pix: parseParc("", "Pix no Crédito - Fulano - 11/12").N, venc: fileVenc("Fatura_2026-10-10.csv") ? fmtM(monthIndex(fileVenc("Fatura_2026-10-10.csv"))) : "", nubank: ITEMS.filter(i => i.file === "Nubank_2026-10-18.csv").every(i => fmtM(i.m) === "out/26") }));
    ok(nucleo.pix === 12 && nucleo.venc === "out/26" && nucleo.nubank, `${nome}: parcela "- 11/12" e mês pelo vencimento do nome do arquivo (${JSON.stringify(nucleo)})`);
    ok(r.estornos === 2, `${nome}: compra estornada e o estorno ficaram zerados (${r.estornos})`);
    ok(r.uber === "Uber / 99", `${nome}: categorizou Uber como "Uber / 99" (${r.uber})`);
    ok(r.json, `${nome}: gravou leitor-faturas-dados.json na pasta`);
    ok(r.resumo, `${nome}: capa mostra o resumo depois de ler`);
    await page.click("#cvGo"); await page.waitForTimeout(500);
    await page.evaluate(() => { selMonth = ITEMS.find(i => i.est).m; render(); });
    ok(await page.isVisible("#estBar"), `${nome}: aviso de estornos aparece no Resumo`);
    for (const t of ["resumo", "cartoes", "analise", "dados", "lancamentos"]) { await page.click(`[data-tab=${t}]`); await page.waitForTimeout(120); }
    await page.fill("#lTx tr.newrow [data-f=desc]", "Conta de luz"); await page.press("#lTx tr.newrow [data-f=desc]", "Tab");
    await page.fill("#lTx tr.newrow [data-f=val]", "120,00"); await page.press("#lTx tr.newrow [data-f=val]", "Tab"); await page.waitForTimeout(200);
    ok(await page.evaluate(() => state.manuais.some(m => m.desc === "Conta de luz" && m.val === 120)), `${nome}: lançamento manual pela tabela`);
    ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${nome}: sem rolagem lateral na página`);
    ok(erros.length === 0, `${nome}: sem erros de JavaScript ${erros.join(" | ")}`);
    await page.close();
  }
  await browser.close();
  console.log(fails ? `\n${fails} falha(s)` : "\nTudo certo.");
  process.exit(fails ? 1 : 0);
})();
