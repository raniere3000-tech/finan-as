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
    ok(await page.evaluate(() => { const mk = (n, val, file, m) => ({ desc: "KaBuM! - NuPay - Parcela " + n + "/10", n, N: 10, val, parcData: "N", cardKey: "Nubank|", date: new Date(2026, 8 + n - 9, 11), mFat: m, file });
      const its = computeMonths([mk(9, 151.71, "a", 24321), mk(10, 151.70, "b", 24322)], {}); return its[0].mEnd === 24321 && its[1].mEnd === 24322; }), `${nome}: parcela 9/10 não conta de novo quando a 10/10 (centavos diferentes) está em outra fatura`);
    ok(r.estornos === 2, `${nome}: compra estornada e o estorno ficaram zerados (${r.estornos})`);
    ok(r.uber === "Uber / 99", `${nome}: categorizou Uber como "Uber / 99" (${r.uber})`);
    ok(r.json, `${nome}: gravou leitor-faturas-dados.json na pasta`);
    ok(r.resumo, `${nome}: capa mostra o resumo depois de ler`);
    await page.click("#cvGo"); await page.waitForTimeout(500);
    await page.evaluate(() => { selMonth = ITEMS.find(i => i.est).m; render(); });
    ok(await page.evaluate(async () => { await gravarAgora(); const a = document.getElementById("bNuvem").dataset.st; state.edicoes["teste-nuvem"] = { cat: "X" }; const b = estadoNuvem();
      document.getElementById("bNuvem").click(); await new Promise(r => setTimeout(r, 300)); const c = document.getElementById("bNuvem").dataset.st; delete state.edicoes["teste-nuvem"]; await gravarAgora(); return a === "ok" && b === "pend" && c === "ok"; }), `${nome}: nuvem mostra ✓ salvo, ✗ quando falta salvar e grava ao tocar`);
    ok(await page.isVisible("#estBar"), `${nome}: aviso de estornos aparece no Resumo`);
    ok(await page.evaluate(() => { go("cartoes"); selCards = null; render(); const b = document.getElementById("cZerShow"); return !!b && ![...document.querySelectorAll("#cTx tr")].some(tr => /Loja Devolvida/.test(tr.textContent)); }), `${nome}: compra estornada fica escondida na lista Todas`);
    await page.evaluate(() => go("resumo"));
    ok(await page.evaluate(() => { const b = document.querySelector("#rCats [data-tog]"); const sub = b.parentElement.querySelector(".barrow.sub"); const antes = sub.offsetParent === null; b.click(); return antes && sub.offsetParent !== null; }), `${nome}: subcategorias começam fechadas e abrem ao tocar`);
    ok(await page.evaluate(() => /R\$/.test(document.getElementById("kCom").textContent)), `${nome}: card de orçamento comprometido`);
    await page.click('.tile[data-dw="kOut"]'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => !document.getElementById("drawer").hidden && document.querySelectorAll("#dwBody details").length > 0 && document.getElementById("dwTot").textContent === document.getElementById("kOut").textContent), `${nome}: card Saídas abre o painel com as categorias`);
    await page.click("#dwX"); await page.click('.tile[data-dw="kCom"]'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => document.getElementById("dwTot").textContent === document.getElementById("kCom").textContent && document.querySelectorAll("#dwBody details.mes").length > 0), `${nome}: orçamento comprometido mês a mês`);
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    ok(await page.evaluate(() => document.getElementById("drawer").hidden), `${nome}: painel fecha`);
    // cartão adicionado à mão + compra parcelada que entra nos meses seguintes
    await page.evaluate(() => go("cartoes")); await page.click("#cAddBtn"); await page.waitForTimeout(100);
    await page.selectOption("#caCard", "__novo");
    await page.fill("#caBanco", "Banco Teste"); await page.fill("#caResp", "Fulana"); await page.fill("#caFin", "4321"); await page.fill("#caFech", "28"); await page.fill("#caVenc", "5");
    await page.evaluate(() => { document.getElementById("caDate").value = "2026-03-10"; caPrev(); });
    await page.fill("#caDesc", "Geladeira nova"); await page.fill("#caVal", "1.000,00"); await page.fill("#caParc", "10");
    ok(await page.evaluate(() => /10x de .*100,00.*abr\/26 até jan\/27/i.test(document.getElementById("caPrev").textContent)), `${nome}: prévia das parcelas no cartão manual`);
    await page.click("#caSave"); await page.waitForTimeout(150);
    ok(await page.evaluate(() => { const it = ITEMS.find(i => i.desc === "Geladeira nova"); return it && it.cardKey === "Banco Teste|4321" && it.val === 100 && it.mEnd - it.m === 9 && cardKeys().includes("Banco Teste|4321"); }), `${nome}: compra parcelada lançada no cartão novo`);
    ok(await page.evaluate(() => { const r = [...document.querySelectorAll("#cResp option")].map(o => o.value); if (!r.includes("Fulana")) return false;
      const sel = document.getElementById("cResp"); sel.value = "Fulana"; sel.dispatchEvent(new Event("change")); const cards = [...document.querySelectorAll("#cCard option")].map(o => o.value);
      const ok1 = cards.length === 2 && cards[1] === "Banco Teste|4321" && [...selCards].join() === "Banco Teste|4321"; sel.value = ""; sel.dispatchEvent(new Event("change")); return ok1 && !document.getElementById("cCfg") && !!document.querySelector("#cDonut svg"); }), `${nome}: filtro por responsável e cartão, rosca na aba Cartões`);
    ok(await page.evaluate(() => { go("resumo"); selMonth = ITEMS.find(i => i.est).m; render(); const x = document.getElementById("estX"); if (!x) return false; x.click(); render(); const fechado = document.getElementById("estBar").hidden; localStorage.removeItem("lf-estX"); render(); go("cartoes"); return fechado; }), `${nome}: ✕ fecha o aviso de estornos`);
    ok(await page.evaluate(() => { const it = ITEMS.find(i => i.desc === "Geladeira nova"); return descM(it, it.m + 2) === "Geladeira nova - Parcela 3/10" && ondeDe(it) !== "Banco Teste|4321" && descM({ kind: "manual", tipo: "Saída", cardKey: "Banco Teste|4321", desc: "Sapato", N: 1, n: 1, m: 0 }, 0) === "Sapato - Parcela 1/1" && descM({ kind: "manual", tipo: "Saída", cardKey: "Pix", desc: "Luz", N: 1, n: 1, m: 0 }, 0) === "Luz"; }), `${nome}: compra à mão mostra "Parcela 3/10" e o nome do cartão`);
    ok(await page.evaluate(() => { const it = ITEMS.find(i => i.desc === "Geladeira nova"); selMonth = it.m + 1; render(); return /100,00/.test(document.getElementById("cNext").textContent) && [...document.querySelectorAll("#cTx tr")].some(tr => /Geladeira nova/.test(tr.textContent) && /2\/10/.test(tr.textContent)); }), `${nome}: parcela aparece na fatura e na próxima`);
    await page.selectOption("#caCard", "Banco Teste|4321");
    await page.fill("#caDesc", "Notebook antigo"); await page.fill("#caVal", "250"); await page.selectOption("#caValTipo", "p"); await page.fill("#caParc", "12"); await page.fill("#caPat", "5");
    await page.click("#caSave"); await page.waitForTimeout(150);
    ok(await page.evaluate(() => { const it = ITEMS.find(i => i.desc === "Notebook antigo"); return it && it.m === selMonth && it.n === 5 && it.mEnd === selMonth + 7 && it.val === 250; }), `${nome}: compra antiga pela parcela atual`);
    for (const t of ["resumo", "cartoes", "analise", "dados", "lancamentos"]) { await page.click(`[data-tab=${t}]`); await page.waitForTimeout(120); }
    await page.fill("#lTx tr.newrow [data-f=desc]", "Conta de luz"); await page.press("#lTx tr.newrow [data-f=desc]", "Tab");
    await page.fill("#lTx tr.newrow [data-f=val]", "120,00"); await page.press("#lTx tr.newrow [data-f=val]", "Tab"); await page.waitForTimeout(200);
    ok(await page.evaluate(() => !state.manuais.some(m => m.desc === "Conta de luz") && document.activeElement.dataset.f === "date"), `${nome}: Tab segue para a data sem lançar ainda`);
    await page.focus("#lTx tr.newrow [data-f=meio]"); await page.press("#lTx tr.newrow [data-f=meio]", "Tab"); await page.waitForTimeout(100);
    ok(await page.evaluate(() => !state.manuais.some(m => m.desc === "Conta de luz") && document.activeElement.dataset.f === "parc"), `${nome}: Tab passa por todos os campos da linha nova`);
    await page.press("#lTx tr.newrow [data-f=parc]", "Tab"); await page.waitForTimeout(200);
    ok(await page.evaluate(() => state.manuais.some(m => m.desc === "Conta de luz" && m.val === 120)), `${nome}: lançamento manual pela tabela (ao sair da linha)`);
    ok(await page.evaluate(() => { const a = document.activeElement; return a && a.dataset.f === "desc" && a.closest("tr") && !a.closest("tr").classList.contains("newrow"); }), `${nome}: depois da linha nova o Tab vai para os lançamentos`);
    const rid = await page.evaluate(() => document.activeElement.closest("tr").dataset.id);
    const v0 = await page.evaluate(id => state.manuais.find(x => x.id === id).val, rid);
    await page.keyboard.press("Tab"); await page.keyboard.press("Control+A"); await page.keyboard.type("130"); await page.keyboard.press("Tab"); await page.waitForTimeout(150);
    ok(await page.evaluate(id => state.manuais.find(x => x.id === id).val === 130 && document.activeElement.dataset.f === "date" && document.activeElement.closest("tr").dataset.id === id, rid), `${nome}: editar lançamento e seguir com Tab`);
    await page.evaluate(([id, v]) => { state.manuais.find(x => x.id === id).val = v; save(); render(); }, [rid, v0]);
    ok(await page.evaluate(() => { const k = cardKeys()[0], d = lDraft.date; Object.assign(lDraft, { desc: "Tênis no cartão", val: 300, meio: k }); lCommit(true);
      const it = ITEMS.find(i => i.desc === "Tênis no cartão"); return it && isCardItem(it) && [...document.querySelectorAll("#lTx tr[data-id]")].some(tr => tr.querySelector("[data-f=desc]").value === "Tênis no cartão" && tr.querySelector("[data-f=meio]").value === k); }), `${nome}: compra no cartão continua na lista de + Lançar para editar`);
    await page.evaluate(() => { state.manuais = state.manuais.filter(x => x.desc !== "Tênis no cartão"); save(); render(); });
    await page.focus("#lTx tr.newrow [data-f=desc]");
    await page.fill("#lTx tr.newrow [data-f=desc]", "conta de luz"); await page.press("#lTx tr.newrow [data-f=desc]", "Tab"); await page.waitForTimeout(150);
    ok(await page.isVisible("#lAjuda [data-usarval]"), `${nome}: ajuda sugere o último valor da mesma descrição`);
    await page.click("#lAjuda [data-usarval]"); await page.waitForTimeout(150);
    ok(await page.evaluate(() => state.manuais.filter(m => /conta de luz/i.test(m.desc) && m.val === 120).length === 2), `${nome}: lançou com o valor sugerido`);
    await page.evaluate(() => { const m = state.manuais.find(x => /conta de luz/i.test(x.desc)); selMonth = (+m.date.slice(0,4))*12 + (+m.date.slice(5,7)) ; render(); });
    ok(await page.isVisible("#lAjuda [data-rec]"), `${nome}: ajuda mostra o que foi lançado no mês anterior`);
    await page.click("#lAjuda [data-rec]"); await page.waitForTimeout(150);
    await page.click("#lAjuda [data-lancar]"); await page.waitForTimeout(150);
    ok(await page.evaluate(() => state.manuais.filter(m => /conta de luz/i.test(m.desc)).length === 3), `${nome}: repetiu lançamento do mês anterior`);
    await page.click("#lAjudaBox summary"); await page.waitForTimeout(100);
    ok(!(await page.isVisible("#lAjuda")), `${nome}: ajuda recolhe`);
    await page.click("#lAjudaBox summary"); await page.waitForTimeout(100);
    ok(await page.isVisible("#lAjuda"), `${nome}: ajuda expande de novo`);
    // PIN
    await page.evaluate(() => go("dados")); await page.waitForTimeout(100);
    ok(await page.evaluate(() => { go("dados"); return [...document.querySelectorAll("#v-dados > .panel, #v-pasta .panel")].every(p => p.classList.contains("fechado")) && document.getElementById("dPinPanel").querySelector("#pA").offsetParent === null; }), `${nome}: caixas da aba Dados começam recolhidas`);
    await page.click("#dPinPanel > header"); await page.waitForTimeout(100);
    ok(await page.isVisible("#pA"), `${nome}: tocar no título abre a caixa`);
    await page.fill("#pA", "1234"); await page.fill("#pB", "1234"); await page.click("#pNovo button[type=submit]"); await page.waitForTimeout(600);
    ok(await page.evaluate(() => !!pinGet() && !document.getElementById("bLock").hidden), `${nome}: ativa o PIN`);
    await page.click("#bLock"); await page.waitForTimeout(100);
    ok(await page.isVisible("#pinLock"), `${nome}: tela de PIN aparece ao bloquear`);
    await page.fill("#pinIn", "9999"); await page.click("#pinGo"); await page.waitForTimeout(600);
    ok(await page.isVisible("#pinLock") && /errado/.test(await page.textContent("#pinErr")), `${nome}: PIN errado não abre`);
    await page.fill("#pinIn", "1234"); await page.press("#pinIn", "Enter"); await page.waitForTimeout(600);
    ok(!(await page.isVisible("#pinLock")), `${nome}: PIN certo abre`);
    ok(await page.evaluate(() => tab === "resumo" && document.getElementById("cover").hidden), `${nome}: depois do PIN entra no Resumo`);
    await page.click("#bEye"); await page.waitForTimeout(100);
    ok(await page.evaluate(() => /•••/.test(document.getElementById("kOut").textContent)), `${nome}: olhinho esconde os valores`);
    await page.click("#bEye"); await page.waitForTimeout(100);
    ok(await page.evaluate(() => /\d/.test(document.getElementById("kOut").textContent) && !/•/.test(document.getElementById("kOut").textContent)), `${nome}: olhinho mostra de novo`);
    await page.evaluate(() => { pinAtivo = Date.now() - 6 * 60000; pinChecar(); }); await page.waitForTimeout(100);
    ok(await page.evaluate(() => oculto && /•••/.test(document.getElementById("kOut").textContent)), `${nome}: tempo parado liga o modo oculto`);
    await page.click("#bEye"); await page.waitForTimeout(100);
    ok(await page.isVisible("#pinLock"), `${nome}: mostrar depois do tempo pede o PIN`);
    await page.fill("#pinIn", "1234"); await page.press("#pinIn", "Enter"); await page.waitForTimeout(600);
    ok(await page.evaluate(() => !oculto && document.getElementById("pinLock").hidden), `${nome}: PIN mostra os valores`);
    await page.evaluate(() => go("dados")); await page.fill("#pAt", "1234"); await page.click("#pTira"); await page.waitForTimeout(600);
    ok(await page.evaluate(() => !pinGet()), `${nome}: tira o PIN`);
    ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${nome}: sem rolagem lateral na página`);
    ok(erros.length === 0, `${nome}: sem erros de JavaScript ${erros.join(" | ")}`);
    await page.close();
  }
  await browser.close();
  console.log(fails ? `\n${fails} falha(s)` : "\nTudo certo.");
  process.exit(fails ? 1 : 0);
})();
