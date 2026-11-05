const BRL=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const MLONG=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const fmtM=m=>MESES[m%12]+"/"+String(Math.floor(m/12)).slice(2);
const fmtMLong=m=>MLONG[m%12]+" "+Math.floor(m/12);
const fmtD=d=>String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();
const fmtDs=d=>String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0");
const isoD=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const $=id=>document.getElementById(id);
const JSON_NAME="leitor-faturas-dados.json";
const inFrame=(()=>{ try{ return window.self!==window.top; }catch(e){ return true; } })();
const FS_OK=!inFrame && typeof window.showDirectoryPicker==="function";
if(window.pdfjsLib){ try{ pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; }catch(e){} }
const PALETTE=["#17806b","#2a6496","#b54728","#8a5cc2","#c28a12","#3d8f3d","#c2457a","#4b6b8a","#a0623a","#5b8c8a","#7a7f2a","#6b6b6b"];

// ---------------- state ----------------
// versão do leitor (mude aqui a cada atualização)
const VERSAO="2.1";
document.querySelectorAll("[data-ver]").forEach(e=>e.textContent="v"+VERSAO);
const blank=()=>({versao:3, atualizado:null, cfg:null, cartoes:JSON.parse(JSON.stringify(DEFAULTS.cards)), arquivos:[], edicoes:{}, manuais:[], regras:[], extras:defaultExtras(), metas:{pct:{nec:50,des:30,pou:20},renda:"",map:{}}, pasta:null, seed:false});
let state=blank(), cfg=DEFAULTS, dirHandle=null, saveTimer=null;
let revMode=false, estMode=false, catTouched=false, tab="resumo", selMonth=null, selCards=null, selCat=null, editingId=null, lTipo="Saída";
// subcategorias novas (pesquisa + as que você criar), mudanças de categoria e ocultas
function defaultExtras(){ return {subs:[
  {nome:"Aluguel",cat:"HABITAÇÃO",grp:"nec",kw:["ALUGUEL"]},
  {nome:"Manutenção da Casa",cat:"HABITAÇÃO",grp:"nec",kw:["LEROY","TELHANORTE","C&C CASA"]},
  {nome:"Móveis e Eletrodomésticos",cat:"HABITAÇÃO",grp:"des",kw:["MAGAZINE LUIZA","MAGALU","CASAS BAHIA","TOK STOK","TOKSTOK","MOBLY"]},
  {nome:"Exames e Laboratório",cat:"SAÚDE",grp:"nec",kw:["LABORAT","FLEURY","SABIN","PARDINI"]},
  {nome:"Óculos e Lentes",cat:"SAÚDE",grp:"nec",kw:["OTICA","ÓTICA"]},
  {nome:"Passagens",cat:"TRANSPORTE",grp:"des",kw:["LATAM","GOL LINHAS","AZUL LINHAS","CLICKBUS","BUSER","DECOLAR","123MILHAS"]},
  {nome:"Calçados e Acessórios",cat:"DESPESAS PESSOAIS",grp:"des",kw:["CENTAURO","NETSHOES","ARTWALK"]},
  {nome:"Cursos Online e Plataformas",cat:"EDUCAÇÃO",grp:"nec",kw:["UDEMY","HOTMART","ALURA","COURSERA","EDUZZ","KIWIFY"]},
  {nome:"Material Escolar",cat:"EDUCAÇÃO",grp:"nec",kw:["KALUNGA","PAPELARIA"]},
  {nome:"Viagens e Hospedagem",cat:"LAZER",grp:"des",kw:["HOTEL","POUSADA","AIRBNB","BOOKING"]},
  {nome:"Cinema, Shows e Eventos",cat:"LAZER",grp:"des",kw:["CINEMARK","CINEPOLIS","INGRESSO","SYMPLA","EVENTIM"]},
  {nome:"Jogos",cat:"LAZER",grp:"des",kw:["STEAM","PLAYSTATION","XBOX","NINTENDO"]},
  {nome:"Eletrônicos e Informática",cat:"OUTROS",grp:"des",kw:["KABUM","FAST SHOP","FASTSHOP"]},
  {nome:"Softwares e Inteligência Artificial",cat:"OUTROS",grp:"des",kw:["CHATGPT","MIDJOURNEY","GITHUB","NOTION"]}
 ], del:[], mov:{}, ren:{}}; }
function extras(){ if(!state.extras) state.extras=defaultExtras(); const X=state.extras; X.subs=X.subs||[]; X.del=X.del||[]; X.mov=X.mov||{}; X.ren=X.ren||{}; return X; }
function origName(n){ const X=extras(); for(const k in X.ren) if(X.ren[k]===n) return k; return n; }
function applyCfg(){
  const base=Object.assign({}, DEFAULTS, state.cfg||{}); const X=extras();
  const catOk=c=>base.cats.some(x=>x.nome===c);
  const rn=n=>X.ren[n]||n;
  const subs=base.subs.map(([n0,c])=>{ const n=rn(n0); return [n, X.mov[n]&&catOk(X.mov[n])? X.mov[n] : c]; });
  base.kw=base.kw.map(([k,t])=>[k,rn(t)]);
  X.subs.forEach(e=>{ if(catOk(e.cat) && !subs.some(s=>s[0]===e.nome)) subs.push([e.nome, X.mov[e.nome]&&catOk(X.mov[e.nome])?X.mov[e.nome]:e.cat]); });
  // palavras da planilha têm prioridade, exceto quando apontam para um "Outros (...)" ou "Compras Diversas" genérico
  const have=new Set(base.kw.filter(k=>!/^outros|compras diversas/i.test(String(k[1]))).map(k=>String(k[0]).toLowerCase()));
  const kw=base.kw.slice(); X.subs.forEach(e=>(e.kw||[]).forEach(k=>{ if(k && (e.user || !have.has(k.toLowerCase()))){ kw.push([k,e.nome]); have.add(k.toLowerCase()); } }));
  cfg=Object.assign(base,{subs:subs.filter(s=>!X.del.includes(s[0])), allSubs:subs, kw, fallbackSub:rn("Outros (Gerais)")}); delete cfg._s2c;
}
// dados de exemplo (só existem quando o build recebe um arquivo de dados com "seed")
function seedState(){ const s=blank(), sd=EMB.seed||{}; if(!(sd.arquivos||[]).length && !(sd.manuais||[]).length) return s;
  s.arquivos=JSON.parse(JSON.stringify(sd.arquivos||[])); s.manuais=JSON.parse(JSON.stringify(sd.manuais||[])); s.seed=true; return s; }
function lsGet(){ try{ const v=localStorage.getItem("lf3-state"); return v?JSON.parse(v):null; }catch(e){ return null; } }
function lsSet(txt){ try{ localStorage.setItem("lf3-state",txt||JSON.stringify(state)); return true; }catch(e){ return false; } }
function hhmm(){ const d=new Date(); return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function setFolder(txt, cls){ $("folderTxt").textContent=txt; $("folderPill").className="pill"+(cls?" "+cls:""); }
function save(){
  state.atualizado=new Date().toISOString(); const lsOk=lsSet();
  if(dirHandle){
    clearTimeout(saveTimer);
    saveTimer=setTimeout(async()=>{
      try{ const fh=await dirHandle.getFileHandle(JSON_NAME,{create:true}); const w=await fh.createWritable(); await w.write(JSON.stringify(state,null,1)); await w.close();
        setFolder(`${dirHandle.name} · salvo às ${hhmm()}`,"ok"); $("saveStatus").textContent=`Dados gravados em ${dirHandle.name}/${JSON_NAME}.`; }
      catch(e){ setFolder("Não consegui gravar o JSON","warn"); }
    },500);
  } else { $("saveStatus").textContent= lsOk? `Salvo neste navegador às ${hhmm()}.` : "Não consegui salvar neste navegador (memória cheia). Em Dados, use Salvar JSON para guardar uma cópia."; }
}
let toastTimer=null;
function toast(html, actions){
  const t=$("toast"); t.innerHTML=`<span>${html}</span>`+(actions||[]).map((a,i)=>`<button type="button" data-i="${i}">${esc(a.label)}</button>`).join("");
  t.hidden=false; t.querySelectorAll("button").forEach(b=>b.onclick=()=>{ actions[+b.dataset.i].run(); t.hidden=true; });
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.hidden=true, actions&&actions.length?9000:4000);
}

// ---------------- tela de carregando ----------------
let ldT0=0;
function loadStart(title, sub){ ldT0=Date.now(); $("ldTitle").textContent=title||"Lendo seus arquivos…"; $("ldSub").textContent=sub||"Preparando"; $("ldFill").style.width="0"; $("ldFill").parentElement.classList.add("indet"); $("loading").hidden=false; }
function loadStep(i, n, name){ const b=$("ldFill").parentElement; b.classList.remove("indet"); $("ldFill").style.width=Math.round(i/Math.max(1,n)*100)+"%"; $("ldSub").textContent=`${Math.min(i+1,n)} de ${n} · ${name}`; }
async function loadEnd(){ $("ldFill").parentElement.classList.remove("indet"); $("ldFill").style.width="100%"; const w=650-(Date.now()-ldT0); if(w>0) await new Promise(r=>setTimeout(r,w)); $("loading").hidden=true; }

// ---------------- folder ----------------
function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open("leitor-faturas",1); r.onupgradeneeded=()=>r.result.createObjectStore("kv"); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function idbSet(k,v){ try{ const db=await idb(); await new Promise((res,rej)=>{ const t=db.transaction("kv","readwrite"); t.objectStore("kv").put(v,k); t.oncomplete=res; t.onerror=rej; }); }catch(e){} }
async function idbGet(k){ try{ const db=await idb(); return await new Promise(res=>{ const t=db.transaction("kv").objectStore("kv").get(k); t.onsuccess=()=>res(t.result); t.onerror=()=>res(null); }); }catch(e){ return null; } }
async function useDir(h){
  dirHandle=h; await idbSet("dir",h); loadStart("Abrindo a pasta…", h.name);
  $("bDir").textContent="Trocar pasta"; $("bRescan").hidden=false; setFolder(h.name+" · lendo…","info");
  let loaded=false;
  try{ const fh=await h.getFileHandle(JSON_NAME); const data=JSON.parse(await (await fh.getFile()).text()); if(data&&data.versao){ state=Object.assign(blank(),data); state.seed=false; loaded=true; } }catch(e){}
  if(!loaded){ // pasta nova: leva junto o que você já configurou neste navegador (sem as faturas de exemplo)
    const keep=state; state=blank();
    if(keep && !keep.seed){ ["cartoes","manuais","regras","extras","metas","edicoes","cfg","arqFinal"].forEach(k=>{ if(keep[k]) state[k]=keep[k]; }); } }
  state.pasta=h.name; applyCfg();
  await scanFolder(true);
  await loadEnd();
}
async function* walk(dir, depth, path){
  for await (const e of dir.values()){
    if(e.kind==="file") yield {handle:e, path:path+e.name};
    else if(e.kind==="directory" && depth<3 && !e.name.startsWith(".")) yield* walk(e, depth+1, path+e.name+"/");
  }
}
let scanning=false;
async function scanFolder(first, quiet){
  if(!dirHandle || scanning) return; scanning=true;
  try{ await scanFolder0(first, quiet); } catch(e){ if(!quiet) setFolder("Não consegui ler a pasta: reconecte","warn"); } finally{ scanning=false; }
}
async function scanFolder0(first, quiet){
  const found=[]; const known=new Map(state.arquivos.map(a=>[a.nome,a]));
  let nFat=0, nPlan=0, nSkip=0, nNew=0; const seen=new Set();
  const all=[]; for await (const x of walk(dirHandle,0,"")) all.push(x);
  const list=all.filter(x=>{ const low=x.handle.name.toLowerCase(); return !(low===JSON_NAME || low.endsWith(".html") || low.startsWith("~$")) && /\.(csv|txt|xlsx|xls|xlsm|pdf)$/.test(low); });
  if(!quiet){ if($("loading").hidden) loadStart("Lendo seus arquivos…", dirHandle.name); $("ldTitle").textContent= list.length? "Lendo seus arquivos…" : "Pasta sem faturas"; if(!list.length) $("ldSub").textContent="Coloque CSV, Excel ou PDF na pasta"; }
  let idx=0;
  for(const {handle,path} of list){
    const nm=handle.name, low=nm.toLowerCase();
    if(!quiet) loadStep(idx, list.length, nm); idx++;
    if(low===JSON_NAME || low.endsWith(".html") || low.startsWith("~$")) continue;
    if(!/\.(csv|txt|xlsx|xls|xlsm|pdf)$/.test(low)){ nSkip++; continue; }
    seen.add(path);
    const file=await handle.getFile(); const prev=known.get(path);
    if(/\.(xlsx|xls|xlsm)$/.test(low)){ const pm=(state.planMod||{})[path]; if(pm && pm.mod===file.lastModified && pm.size===file.size){ seen.add(path); if(pm.plan){ continue; } } }
    if(prev && prev.mod===file.lastModified && prev.size===file.size){ nFat++; continue; }
    const r=await readAny(file, path);
    if(r==="plan"){ nPlan++; state.planMod=Object.assign(state.planMod||{},{[path]:{mod:file.lastModified,size:file.size,plan:true}}); continue; }
    if(r){ r.mod=file.lastModified; r.size=file.size; state.arquivos=state.arquivos.filter(a=>a.nome!==r.nome); state.arquivos.push(r); nFat++; nNew++; }
  }
  // arquivos que saíram da pasta deixam de contar (os escolhidos à mão ficam)
  const gone=state.arquivos.filter(a=>!a.manual && !seen.has(a.nome)); if(gone.length) state.arquivos=state.arquivos.filter(a=>a.manual || seen.has(a.nome));
  if(quiet && !nNew && !gone.length && !nPlan){ return; }
  state.seed=false; save(); render();
  setFolder(`${dirHandle.name} · ${nFat} faturas${nPlan?" · planilha lida":""}`,"ok");
  if(gone.length) toast(`${gone.length} arquivo(s) que não estão mais na pasta saíram da conta: ${gone.map(a=>esc(a.nome)).join(", ")}.`);
  if(first||nNew) showBanner(`Pasta <b>${esc(dirHandle.name)}</b> lida: ${nFat} fatura(s)${nPlan?", planilha com categorias e lançamentos":""}. Os dados ficam salvos no ${JSON_NAME} dessa pasta.`,"ok");
}
$("bDir").onclick=async()=>{
  if(!FS_OK){ go("pasta"); showBanner(inFrame?"Para conectar uma pasta, abra o arquivo leitor-faturas.html no Chrome ou Edge do computador. Aqui os dados ficam só neste navegador.":"Este navegador não conecta pastas. Use o Chrome ou o Edge, ou os botões Salvar JSON e Abrir JSON."); return; }
  try{
    const saved=await idbGet("dir");
    if(saved && !dirHandle){ const p=await saved.requestPermission({mode:"readwrite"}); if(p==="granted"){ await useDir(saved); return; } }
    const h=await window.showDirectoryPicker({mode:"readwrite",id:"leitor-faturas"}); await useDir(h);
  }catch(e){ if(e&&e.name!=="AbortError") setFolder("Não consegui acessar a pasta","warn"); }
};
$("bRescan").onclick=async()=>{ loadStart("Lendo seus arquivos…", dirHandle?dirHandle.name:""); await scanFolder(false); await loadEnd(); };
// quando você volta para a janela, o leitor confere a pasta de novo (pega faturas novas e as que saíram)
let lastAuto=0;
function autoScan(){ if(!dirHandle || document.hidden) return; const t=Date.now(); if(t-lastAuto<4000) return; lastAuto=t; scanFolder(false,true); }
window.addEventListener("focus",autoScan); document.addEventListener("visibilitychange",autoScan);
setInterval(autoScan,60000);

// ---------------- reading files ----------------
async function pdfToText(buf){
  const doc=await pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise; let lines=[];
  for(let p=1;p<=doc.numPages;p++){ const pg=await doc.getPage(p); const tc=await pg.getTextContent(); lines=lines.concat(pdfItemsToLines(tc.items)); }
  return pdfLinesToCsv(lines);
}
async function readAny(file, nome){
  nome=nome||file.name; const low=file.name.toLowerCase();
  try{
    const buf=await file.arrayBuffer();
    if(/\.(xlsx|xls|xlsm)$/.test(low)){
      const wb=XLSX.read(buf,{type:"array",cellDates:false});
      if(wb.SheetNames.includes("Cadastros")){ loadPlan(wb); return "plan"; }
      return {nome, origem:"xlsx", colMode:true, rows:XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:""})};
    }
    if(low.endsWith(".pdf")){ const r=await pdfToText(buf); return r.count? {nome, origem:"pdf", colMode:false, text:r.text} : {nome, origem:"pdf", erro:"Não encontrei lançamentos neste PDF."}; }
    let text=new TextDecoder("utf-8").decode(buf); if(text.includes("�")) text=new TextDecoder("windows-1252").decode(buf);
    return {nome, origem:"csv", colMode:false, text};
  }catch(e){ return {nome, origem:"?", erro:"Não consegui ler este arquivo."}; }
}
async function addFiles(list){
  let n=0; const arr=[...list]; if(arr.length) loadStart("Lendo seus arquivos…");
  for(const [ix,f] of arr.entries()){ loadStep(ix, arr.length, f.name);
    if(/\.json$/i.test(f.name)){ await openJson(f); continue; }
    const r=await readAny(f); if(r && r!=="plan"){ if(state.seed){ state=Object.assign(blank(),{cfg:state.cfg,cartoes:state.cartoes,regras:state.regras}); applyCfg(); }
      r.manual=true; state.arquivos=state.arquivos.filter(a=>a.nome!==r.nome); state.arquivos.push(r); n++; }
  }
  save(); render(); if(arr.length) await loadEnd();
  if(n){ closeCoverNow(); go("lancamentos"); showBanner(`${n} fatura(s) carregada(s). Agora lance aqui os Pix, boletos e outros gastos do mês.`,"ok"); }
}
const cv=(ws,ref)=>{ const c=ws[ref]; return c? c.v : undefined; };
function loadPlan(wb){
  const K=wb.Sheets["Cadastros"]; if(!K) return;
  const c={}; const v2 = norm(cv(K,"N3")).startsWith("subcategoria");
  if(v2){
    const cats=[]; for(let r=4;r<=23;r++){ const n=cv(K,"I"+r); if(n) cats.push({nome:String(n),tipo:String(cv(K,"J"+r)||"Despesa"),grupo:cv(K,"K"+r)||null}); }
    const subs=[]; for(let r=4;r<=129;r++){ const s=cv(K,"N"+r), k=cv(K,"O"+r); if(s&&k) subs.push([String(s),String(k)]); }
    const kw=[]; for(let r=4;r<=153;r++){ const k=cv(K,"AA"+r), s=cv(K,"AB"+r); if(k&&s) kw.push([String(k),String(s)]); }
    if(cats.length) c.cats=cats; if(subs.length) c.subs=subs; if(kw.length) c.kw=kw.concat(DEFAULTS.kw.filter(x=>!kw.some(y=>y[0]===x[0])));
  } else {
    const cats=[]; for(let r=4;r<=23;r++){ const n=cv(K,"F"+r); if(n) cats.push({nome:String(n),tipo:String(cv(K,"G"+r)||"Despesa"),grupo:cv(K,"H"+r)||null}); }
    const kw=[]; for(let r=4;r<=203;r++){ const k=cv(K,"R"+r), s=cv(K,"S"+r); if(k&&s) kw.push([String(k),String(s)]); }
    if(cats.length){ c.cats=cats; c.subs=DEFAULTS.subs.filter(([s,k])=>cats.some(x=>x.nome===k)); }
    if(kw.length) c.kw=DEFAULTS.kw.concat(kw.filter(x=>!DEFAULTS.kw.some(y=>y[0]===x[0])));
    const syn={}; [["date","U"],["desc","V"],["val","W"],["parc","X"],["fin","Y"],["cat","Z"]].forEach(([k,L])=>{ const a=[]; for(let r=4;r<=15;r++){ const v=cv(K,L+r); if(v) a.push(norm(v)); } if(a.length) syn[k]=a; });
    if(syn.date&&syn.val) c.syn=Object.assign({},DEFAULTS.syn,syn);
    const banks=[]; for(let r=22;r<=31;r++){ const s=cv(K,"AB"+r); if(!s) continue; const pd=String(cv(K,"AE"+r)||"").trim();
      banks.push({sig:String(s),name:String(cv(K,"AC"+r)||"Banco novo"),inv:/^s/i.test(String(cv(K,"AD"+r)||"")),parcData:pd?pd[0].toUpperCase():"",tpl:String(cv(K,"AF"+r)||"")}); }
    if(banks.length) c.banks=banks;
    const C=wb.Sheets["Cartões"]; if(C){ for(let r=6;r<=20;r++){ const key=cv(C,"H"+r); if(!key) continue; const cur=state.cartoes[key]||{};
      state.cartoes[key]=Object.assign(cur,{alias:cv(C,"E"+r)?String(cv(C,"E"+r)):cur.alias, fech:cv(C,"F"+r)||cur.fech, venc:cv(C,"I"+r)||cur.venc}); } }
  }
  state.cfg=c; applyCfg();
  // manual lançamentos (not credit card ones — those come from the faturas)
  const L=wb.Sheets["Lançamentos"]; let n=0;
  if(L){
    const keep=state.manuais.filter(m=>m.origem!=="planilha");
    const imp=[];
    for(let r=5;r<=504;r++){
      const a=cv(L,"A"+r); if(a===undefined||a==="") continue;
      let d=parseDate(a); if(!d) continue;
      let rec;
      if(v2){ const tipo=cv(L,"C"+r), cat=cv(L,"D"+r), sub=cv(L,"E"+r), meio=cv(L,"F"+r), val=cv(L,"G"+r), ex=cv(L,"H"+r);
        if(ex==="Sim"||!cat||val===undefined||val==="") continue;
        rec={tipo:(tipo==="Receita"||tipo==="Benefício")?"Entrada":"Saída", cat:String(cat), sub:sub?String(sub):"", meio:String(meio||""), val:+val, parc:1};
      } else { const cat=cv(L,"C"+r), meio=cv(L,"D"+r), val=cv(L,"E"+r), parc=cv(L,"F"+r), es=cv(L,"G"+r);
        if(!cat||val===undefined||val==="") continue; const ct=(cfg.cats.find(x=>x.nome===cat)||{}).tipo;
        rec={tipo: es? String(es) : (ct==="Despesa"?"Saída":"Entrada"), cat:String(cat), sub:"", meio:String(meio||""), val:+val, parc:+parc||1}; }
      if(/cart[aã]o de cr[eé]dito|^nubank|^c6 \d|^mercado pago/i.test(rec.meio) || Object.keys(state.cartoes).some(k=>cardName(k)===rec.meio)) continue;
      imp.push(Object.assign({id:"p:"+isoD(d)+"|"+String(cv(L,"B"+r)||"").trim()+"|"+rec.val, date:isoD(d), desc:String(cv(L,"B"+r)||"").trim(), origem:"planilha"},rec)); n++;
    }
    const edited=new Map(state.manuais.filter(m=>m.origem==="planilha"&&m.alterado).map(m=>[m.id,m]));
    state.manuais=keep.concat(imp.map(m=>edited.get(m.id)||m));
  }
  toast(`Planilha lida: ${cfg.cats.length} categorias, ${cfg.subs.length} subcategorias${n?`, ${n} lançamentos`:""}.`);
  save();
}
async function openJson(f){
  try{ const data=JSON.parse(await f.text()); if(!data.versao) throw 0; state=Object.assign(blank(),data); state.seed=false; applyCfg(); save(); render(); toast("Dados carregados do JSON."); }
  catch(e){ toast("Esse arquivo não é um JSON do Leitor de Faturas."); }
}

// ---------------- items ----------------
function cardName(key){ const c=state.cartoes[key]||{}; if(c.alias) return c.alias; if(!String(key).includes("|")) return key; const [b,f]=key.split("|"); return b+(f?" "+f:""); }
// cartão = chave "Banco|final"; lançamento manual pago com cartão conta na fatura dele
const isCardKey=k=>String(k||"").includes("|");
const isCardItem=i=>i.kind==="cartao" || (i.kind==="manual" && isCardKey(i.cardKey) && i.tipo!=="Entrada");
function catColor(cat){ const i=cfg.cats.findIndex(c=>c.nome===cat); return PALETTE[(i<0?11:i)%PALETTE.length]; }
let ITEMS=[], INFO=[];
function build(){
  let items=[]; INFO=[];
  for(const f of state.arquivos){
    if(f.erro){ INFO.push({nome:f.nome,erro:f.erro,origem:f.origem}); continue; }
    const p=parseRows(f.colMode? f.rows : linesToRows(f.text||""), cfg, f.colMode, f.nome, state.regras);
    const seen={}, fv=fileVenc(f.nome);
    p.items.forEach(it=>{ if(fv) it.mFat=monthIndex(fv); const base=[it.cardKey,isoD(it.date),it.desc,it.val,it.n+"/"+it.N].join("|"); seen[base]=(seen[base]||0)+1; it.id=base+"#"+seen[base]; it.kind="cartao"; it.tipo="Saída";
      // fatura sem número do cartão: usa o final que você informou para este arquivo
      const af=(state.arqFinal||{})[f.nome]; if(!it.fin && af){ it.fin=af; it.cardKey=it.bank+"|"+af; } });
    items=items.concat(p.items); INFO.push({nome:f.nome,p,origem:f.origem});
  }
  for(const m of state.manuais){
    const d=new Date(m.date+"T12:00:00"), d0=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    items.push({id:m.id, kind:"manual", date:d0, desc:m.desc, val:+m.val, tipo:m.tipo||"Saída", cat:m.cat||"OUTROS", sub:m.sub||"", meio:m.meio||"Pix",
      cardKey:m.meio||"Pix", n:1, N:Math.max(1,+m.parc||1), parcData:"S", ign:false, origem:m.origem});
    // compra antiga lançada pela parcela atual: a parcela pAt cai na fatura do mês mesP
    const it=items[items.length-1]; if(+m.pAt>1 && m.mesP!=null){ it.n=Math.min(+m.pAt,it.N); it.mFat=+m.mesP; }
  }
  items.forEach(it=>{ const e=state.edicoes[it.id]; if(e&&e.card) it.cardKey=e.card; });
  computeMonths(items, state.cartoes);
  items.forEach(it=>{ it.val0=it.val; const e=state.edicoes[it.id]; if(!e) return;
    if(e.cat){ it.cat=e.cat; it.sub=e.sub||""; } if(e.ign!=null) it.ign=!!e.ign; if(e.desc) it.desc=e.desc; if(e.val!=null&&e.val!=="") it.val=+e.val;
    if(e.mes!=null&&e.mes!==""){ const sp=it.mEnd-it.m; it.m=+e.mes; it.mEnd=it.m+sp; } it.edited=true;
    it.catEd=!!e.cat; it.mesEd=e.mes!=null&&e.mes!==""; it.naoEst=!!e.naoEst; });
  // cartão pago por outra pessoa: nada dele entra na sua conta
  items.forEach(it=>{ const c=isCardItem(it) && state.cartoes[it.cardKey]; if(c && c.terceiro && !it.ign){ it.ign=true; it.terc=true; } });
  // estornos: compra devolvida e o estorno ficam zerados
  matchEstornos(items);
  ITEMS=items;
}
const inM=(i,m)=>!i.ign && i.m<=m && i.mEnd>=m;
const isOut=i=>i.tipo!=="Entrada";
function monthsAll(){ const s=new Set(); ITEMS.forEach(i=>{ if(i.ign) return; for(let m=i.m;m<=i.mEnd;m++) s.add(m); }); return [...s].sort((a,b)=>a-b); }

// ---------------- render ----------------
function showBanner(html, cls){ const b=$("banner"); b.innerHTML=`<span>${html}</span><button type="button" class="ghost" id="bClose">Fechar</button>`; b.className="banner"+(cls?" "+cls:""); b.hidden=false; $("bClose").onclick=()=>b.hidden=true; }
function go(t){ if(t==="pasta") t="dados"; tab=t; if(location.hash!=="#"+t){ try{ history.replaceState(null,"","#"+t); }catch(e){ location.hash=t; } } render(); }
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{ go(b.dataset.tab); if(b.dataset.tab==="lancamentos") setTimeout(()=>{ const i=$("lTx").querySelector("tr.newrow [data-f=desc]"); if(i) i.focus(); },60); });
window.addEventListener("hashchange",()=>{ const h=location.hash.slice(1); if(["resumo","cartoes","analise","lancamentos","pasta","dados"].includes(h)){ const t=h==="pasta"?"dados":h; if(t!==tab){ tab=t; render(); } } });
$("mPrev").onclick=()=>{ selMonth--; render(); };
$("mNext").onclick=()=>{ selMonth++; render(); };

function barsHTML(rows, total, opts={}){
  if(!rows.length) return `<div class="empty">${opts.empty||"Nada neste mês."}</div>`;
  const max=Math.max(...rows.map(r=>Math.abs(r.v)),1);
  return rows.map(r=>{ const tag=opts.click?"button":"div"; return `<${tag} class="barrow"${opts.click?` type="button" data-k="${esc(r.k)}"`:""}><span class="nm">${r.c?`<span class="sw" style="background:${r.c}"></span>`:""}${esc(r.label)}</span><span class="track"><span class="fill" style="width:${Math.max(0,r.v)/max*100}%;background:${r.c||"var(--accent)"}"></span></span><span class="v">${BRL.format(r.v)}</span><span class="p">${total?Math.round(r.v/total*100)+"%":""}</span></${tag}>`; }).join("");
}
function group(list, keyFn, labelFn, colorFn){
  const m=new Map(); list.forEach(i=>{ const k=keyFn(i); const o=m.get(k)||{k,label:labelFn?labelFn(i):k,v:0,n:0,c:colorFn?colorFn(i):null}; o.v+=i.val; o.n++; m.set(k,o); });
  return [...m.values()].sort((a,b)=>b.v-a.v);
}
function subOptions(cat){ return cfg.subs.filter(s=>s[1]===cat).map(s=>s[0]); }
function catOptions(selCat, selSub, entrada){
  let found=false; const opts=[];
  for(const c of cfg.cats.filter(c=> entrada? c.tipo!=="Despesa" : c.tipo==="Despesa")){ const subs=subOptions(c.nome);
    opts.push(`<optgroup label="${esc(c.nome)}">`+(subs.length?subs:[""]).map(s=>{ const on=!found && selCat===c.nome && (selSub==null || (selSub||"")===s); if(on) found=true; return `<option value="${esc(c.nome+"||"+s)}"${on?" selected":""}>${esc(s||c.nome)}</option>`; }).join("")+`</optgroup>`); }
  return opts.join("");
}
function catSubSelect(it){ return `<select data-cs="${esc(it.id)}" aria-label="Categoria e subcategoria">${catOptions(it.cat, it.sub||"")}</select>`; }
function targetOf(t){ const s2c=subToCat(cfg); if(s2c[t]) return {cat:s2c[t],sub:t}; return {cat:t,sub:null}; }
function ruleKey(desc){ const mk=merchant(desc).trim(); return mk.length>=3? mk : ""; }
// grava (ou atualiza) uma regra a partir de uma descrição; devolve a chave usada
function learnRule(desc, cat, sub){
  const mk=ruleKey(desc); if(!mk) return null; const k=mk.toLowerCase(); if(!String(desc).toLowerCase().includes(k)) return null;
  const old=state.regras.find(r=>r.k===k);
  state.regras=state.regras.filter(r=>r.k!==k);
  state.regras.unshift({k, t: sub||cat, ex:[...new Set([String(desc),...((old&&old.ex)||[])])].slice(0,5), em:isoD(new Date())});
  return {k, mk};
}
function learnFrom(it, cat, sub, confirmar){
  const snap={regras:JSON.parse(JSON.stringify(state.regras)), edicoes:JSON.parse(JSON.stringify(state.edicoes)), man:it.kind==="manual"?JSON.parse(JSON.stringify(state.manuais.find(x=>x.id===it.id))):null};
  const setOne=()=>{ if(it.kind==="manual"){ const m=state.manuais.find(x=>x.id===it.id); m.cat=cat; m.sub=sub; m.alterado=true; } else state.edicoes[it.id]=Object.assign(state.edicoes[it.id]||{},{cat,sub}); };
  const L=learnRule(it.desc, cat, sub);
  if(!L){ setOne(); save(); render(); toast(confirmar?"Categoria confirmada para esta compra.":`Categoria trocada só nesta compra (a descrição é curta demais para virar regra).`); return; }
  if(it.kind==="manual") setOne();
  // compras de cartão da mesma loja passam a seguir a regra (some a edição individual de categoria)
  ITEMS.filter(i=>i.kind==="cartao" && ruleKey(i.desc).toLowerCase()===L.k && i.desc.toLowerCase().includes(L.k)).forEach(i=>{ const e=state.edicoes[i.id]; if(e){ delete e.cat; delete e.sub; if(!Object.keys(e).length) delete state.edicoes[i.id]; } });
  save(); render();
  const n=ITEMS.filter(i=>i.kind==="cartao" && i.how==="regra" && i.rk===L.k).length;
  const undo={label:"Só esta compra",run:()=>{ state.regras=snap.regras; state.edicoes=snap.edicoes; if(snap.man){ const j=state.manuais.findIndex(x=>x.id===it.id); if(j>=0) state.manuais[j]=snap.man; } setOne(); save(); render(); toast("Ok, mudei só esta compra e não guardei a regra."); }};
  toast(`${confirmar?"Confirmado":"Aprendido"}: “${esc(L.mk)}” vai para <b>${esc(sub||cat)}</b>.${n>1?` ${n} compras seguem a regra`:""} As próximas faturas já vêm assim.`,[undo,{label:"Ver regras",run:()=>{ go("pasta"); setTimeout(()=>$("pRules").scrollIntoView({behavior:"smooth"}),60); }}]);
}
function bindCatSelects(root){
  root.querySelectorAll("select[data-cs]").forEach(s=>s.onchange=()=>{
    const [cat,sub]=s.value.split("||"); const it=ITEMS.find(i=>i.id===s.dataset.cs); if(!it) return;
    learnFrom(it, cat, sub, false);
  });
  root.querySelectorAll("[data-ok]").forEach(b=>b.onclick=()=>{ const it=ITEMS.find(i=>i.id===b.dataset.ok); if(it) learnFrom(it, it.cat, it.sub||"", true); });
}
const needsReview=i=>i.kind==="cartao" && !i.ign && !i.edited && (i.how==="palpite"||i.how==="padrao");
function howTag(i){
  if(i.edited) return ' <span class="tag info">alterado</span>';
  if(i.how==="regra") return ` <span class="tag learn" title="Regra: contém “${esc(i.rk)}”">aprendido</span>`;
  if(i.how==="palpite") return ' <span class="tag warn" title="Deduzido por lojas parecidas. Confira e toque em ✓ se estiver certo.">palpite</span>';
  if(i.how==="padrao") return ' <span class="tag warn" title="Nenhuma regra reconheceu esta compra">sem regra</span>';
  return "";
}

function render(){
  applyTabs(); build();
  const ms=monthsAll();
  if(selMonth===null){ const real=ITEMS.filter(i=>!i.ign&&i.kind==="cartao").map(i=>i.m); const now=new Date(); selMonth= real.length? Math.max(...real) : now.getFullYear()*12+now.getMonth(); }
  $("mCur").textContent=fmtMLong(selMonth);
  $("monthbar").hidden = tab==="pasta"||tab==="dados";
  if(state.seed && !$("banner").dataset.seen){ $("banner").dataset.seen="1"; showBanner("Mostrando os dados de exemplo. Clique em <b>Conectar pasta</b> para usar as suas faturas.","info"); }
  ({resumo:rResumo,cartoes:rCartoes,analise:rAnalise,lancamentos:rLanc,pasta:rPasta,dados:()=>{ rDados(); rPasta(); }})[tab]();
  alerts(); estAviso();
  updateCover();
}
function updateCover(){
  if($("cover").classList.contains("out")) return;
  const connected=!!dirHandle; $("cvConnect").hidden=connected; $("cvSummary").hidden=!connected;
  $("cvLead").textContent= connected? "Cartões, Pix e boletos num lugar só. Veja para onde foi o dinheiro e onde dá para economizar." : (FS_OK? "Para começar, conecte a pasta das suas faturas." : "Para começar, escolha os arquivos das suas faturas.");
  $("cvConnTxt").textContent= !FS_OK? "Escolher arquivos" : (savedName? `Reconectar a pasta ${savedName}` : "Conectar pasta");
  $("cvSkip").textContent= state.seed? "Ver com os dados de exemplo" : "Entrar sem conectar";
  const m=selMonth, cur=ITEMS.filter(i=>inM(i,m)); const ins=cur.filter(i=>!isOut(i)).reduce((s,i)=>s+i.val,0), outs=cur.filter(isOut).reduce((s,i)=>s+i.val,0);
  $("cvMes").textContent="Saídas · "+MLONG[m%12].toLowerCase(); $("cvOut").textContent=BRL.format(outs); $("cvOut").className="val out";
  coverMetas(m);
  $("cvIn").textContent=BRL.format(ins); const b=ins-outs; $("cvBal").textContent=BRL.format(b); $("cvBal").className="val "+(b<0?"out":"in");
  $("cvFoot").textContent = dirHandle? `Pasta conectada: ${dirHandle.name}. Seus arquivos são lidos só neste computador.` : (FS_OK? "Funciona no Chrome ou no Edge do computador. Seus arquivos não saem do seu computador." : (inFrame? "Aqui não dá para conectar pasta: escolha os arquivos (inclusive do Google Drive). Para conectar a pasta, abra o leitor-faturas.html no Chrome ou Edge do computador." : "Este navegador não conecta pastas: escolha os arquivos. No computador, use o Chrome ou o Edge."));
}
function closeCover(){ $("cover").classList.add("out"); setTimeout(()=>{ $("cover").hidden=true; },480); }
function closeCoverNow(){ if(!$("cover").hidden){ $("cover").classList.add("out"); $("cover").hidden=true; } }
let savedName="";
$("cvGo").onclick=closeCover;
$("cvSkip").onclick=closeCover;
$("cvDir").onclick=()=>{ $("bDir").click(); };
$("cvConn").onclick=()=>{ if(!FS_OK){ $("fFiles").click(); return; } $("bDir").click(); };
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!$("cover").hidden) closeCover(); });
function applyTabs(){ document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===tab)); ["resumo","cartoes","analise","lancamentos","pasta","dados"].forEach(t=>$("v-"+t).hidden= !(t===tab || (t==="pasta"&&tab==="dados"))); }

function rResumo(){
  const m=selMonth, cur=ITEMS.filter(i=>inM(i,m));
  const ins=cur.filter(i=>!isOut(i)).reduce((s,i)=>s+i.val,0), outs=cur.filter(isOut).reduce((s,i)=>s+i.val,0);
  $("kIn").textContent=BRL.format(ins); $("kOut").textContent=BRL.format(outs);
  const cards=cur.filter(i=>isOut(i)&&isCardItem(i)).reduce((s,i)=>s+i.val,0);
  $("kOutSub").textContent=`${BRL.format(cards)} em cartões · ${BRL.format(outs-cards)} em Pix e boletos`;
  const bal=ins-outs; $("kBal").textContent=BRL.format(bal); $("kBal").className="val "+(bal<0?"out":"in");
  // tudo o que já está comprometido nos meses seguintes (parcelas de cartão e lançamentos parcelados)
  const futOut=ITEMS.filter(i=>!i.ign && isOut(i) && (i.mEnd!=null? i.mEnd : i.m) > m), ultM=futOut.reduce((x,i)=>Math.max(x, i.mEnd!=null? i.mEnd : i.m), m);
  let com=0; for(let x=m+1;x<=ultM;x++) com+=ITEMS.filter(i=>inM(i,x)&&isOut(i)).reduce((s,i)=>s+i.val,0);
  const prox=ITEMS.filter(i=>inM(i,m+1)&&isOut(i)).reduce((s,i)=>s+i.val,0);
  $("kCom").textContent=BRL.format(com);
  $("kComSub").textContent= com>0? `até ${fmtM(ultM)} · ${fmtM(m+1)}: ${BRL.format(prox)}` : "nada comprometido nos próximos meses";
  const cats=group(cur.filter(isOut), i=>i.cat, null, i=>catColor(i.cat));
  $("rCats").innerHTML=catSubBars(cur.filter(isOut), cats, outs);
  $("rCatsTot").textContent=BRL.format(outs);
  $("rCats").querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>{ selCat=b.dataset.k; go("analise"); });
  const syncAll=()=>{ const gs=[...$("rCats").querySelectorAll(".catgrp")]; $("rCatsAll").textContent= gs.length && gs.every(g=>g.classList.contains("open"))? "Fechar todas" : "Abrir todas"; };
  $("rCats").querySelectorAll("[data-tog]").forEach(b=>b.onclick=()=>{ const k=b.dataset.tog, g=b.parentElement, ab=!g.classList.contains("open");
    g.classList.toggle("open",ab); b.setAttribute("aria-expanded",ab); if(ab) catsAbertas.add(k); else catsAbertas.delete(k); syncAll(); });
  $("rCatsAll").onclick=()=>{ const abrir=$("rCatsAll").textContent==="Abrir todas"; $("rCats").querySelectorAll("[data-tog]").forEach(b=>{ const g=b.parentElement; g.classList.toggle("open",abrir); b.setAttribute("aria-expanded",abrir); if(abrir) catsAbertas.add(b.dataset.tog); else catsAbertas.delete(b.dataset.tog); }); syncAll(); };
  syncAll();
  $("rDonut").innerHTML=donutSVG(cats, outs);
  $("rDonut").querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>{ selCat=b.dataset.k; go("analise"); });
  mesesChart(m);
  const pay=group(cur.filter(isOut), i=>isCardItem(i)?"c:"+i.cardKey:"m:"+i.meio, i=>isCardItem(i)?cardName(i.cardKey):i.meio);
  $("rPay").innerHTML=barsHTML(pay, outs);
  const fut=[]; for(let k=1;k<=3;k++){ const v=ITEMS.filter(i=>inM(i,m+k)&&isOut(i)).reduce((s,i)=>s+i.val,0); fut.push({k:"f"+k,label:fmtMLong(m+k),v}); }
  $("rFut").innerHTML=barsHTML(fut.filter(f=>f.v), 0, {empty:"Nada comprometido nos próximos meses."});
  rMetas(m, cur, ins, outs);
}

// ---------------- resumo: rosca, categorias com subcategorias, mês a mês ----------------
const catsAbertas=new Set();
function catSubBars(list, cats, total){
  if(!cats.length) return `<div class="empty">Nenhuma saída neste mês.</div>`;
  const max=Math.max(...cats.map(r=>Math.abs(r.v)),1);
  const row=(r,sub,tog)=>`<button type="button" class="barrow${sub?" sub":""}" ${sub?`data-k="${esc(r.cat)}"`:`data-tog="${esc(r.cat)}" aria-expanded="${catsAbertas.has(r.cat)}"`}><span class="nm">${sub?"":`<span class="tg">${tog?"▸":""}</span><span class="sw" style="background:${r.c}"></span>`}${esc(r.label)}</span><span class="track"><span class="fill" style="width:${Math.max(0,r.v)/max*100}%;background:${r.c};${sub?"opacity:.55":""}"></span></span><span class="v">${BRL.format(r.v)}</span><span class="p">${total?Math.round(r.v/total*100)+"%":""}</span></button>`;
  return cats.map(c=>{ const subs=group(list.filter(i=>i.cat===c.k), i=>i.sub||"(sem subcategoria)").filter(x=>Math.abs(x.v)>=0.005);
    const showSubs= subs.length>1 || (subs[0] && subs[0].k!=="(sem subcategoria)" && subs[0].k!==c.k);
    const lista= showSubs? subs : [{label:"ver as compras",v:c.v}];
    return `<div class="catgrp${catsAbertas.has(c.k)?" open":""}">`+row({cat:c.k,label:c.label,v:c.v,c:c.c},false,true)+`<div class="subs">`+lista.map(x=>row({cat:c.k,label:x.label,v:x.v,c:c.c},true)).join("")+`</div></div>`; }).join("");
}
function donutSVG(cats, total){
  const pos=cats.filter(c=>c.v>0), sum=pos.reduce((s,c)=>s+c.v,0);
  if(!sum) return `<div class="empty">Nenhuma saída neste mês.</div>`;
  const R=100, r=64, cx=110, cy=110, gap=pos.length>1? 0.012 : 0; let a=-Math.PI/2, out="";
  const pt=(ang,rad)=>[cx+rad*Math.cos(ang), cy+rad*Math.sin(ang)];
  pos.forEach(c=>{ const frac=c.v/sum, a0=a+gap, a1=a+frac*2*Math.PI-gap; a+=frac*2*Math.PI; if(a1<=a0) return;
    if(frac>0.9999){ out+=`<path data-k="${esc(c.k)}" fill="${c.c}" fill-rule="evenodd" d="M${cx-R},${cy}a${R},${R} 0 1,0 ${2*R},0a${R},${R} 0 1,0 ${-2*R},0M${cx-r},${cy}a${r},${r} 0 1,0 ${2*r},0a${r},${r} 0 1,0 ${-2*r},0"><title>${esc(c.label)}: ${BRL.format(c.v)} (100%)</title></path>`; return; }
    const big=(a1-a0)>Math.PI?1:0, [x0,y0]=pt(a0,R), [x1,y1]=pt(a1,R), [x2,y2]=pt(a1,r), [x3,y3]=pt(a0,r);
    out+=`<path data-k="${esc(c.k)}" fill="${c.c}" d="M${x0},${y0}A${R},${R} 0 ${big},1 ${x1},${y1}L${x2},${y2}A${r},${r} 0 ${big},0 ${x3},${y3}Z"><title>${esc(c.label)}: ${BRL.format(c.v)} (${Math.round(frac*100)}%)</title></path>`; });
  return `<svg viewBox="0 0 220 220" role="img" aria-label="Gastos do mês por categoria, total ${BRL.format(total)}">${out}</svg><div class="ctr"><b>${BRL.format(total)}</b><span>total de saídas</span></div>`;
}
let mesesTimer=null;
window.addEventListener("resize",()=>{ clearTimeout(mesesTimer); mesesTimer=setTimeout(()=>{ if(tab==="resumo") mesesChart(selMonth); },150); });
function mesesChart(sel){
  const box=$("rMeses"); if(!box) return;
  const realMs=ITEMS.filter(i=>!i.ign && i.kind==="cartao").map(i=>i.m), allMs=monthsAll();
  if(!allMs.length){ box.innerHTML=`<div class="empty">Sem dados.</div>`; $("rMesesLeg").innerHTML=""; $("rMesesNote").textContent=""; return; }
  const last=realMs.length? Math.max(...realMs) : sel;          // último mês com fatura real
  const lastAll=Math.max(...allMs, last);                       // até a última parcela conhecida
  const first=Math.max(Math.min(...allMs), last-11);
  const ms=[]; for(let x=first;x<=lastAll;x++) ms.push(x);
  const outs=ms.map(x=>ITEMS.filter(i=>inM(i,x)&&isOut(i)).reduce((s,i)=>s+i.val,0));
  const ins=ms.map(x=>ITEMS.filter(i=>inM(i,x)&&!isOut(i)).reduce((s,i)=>s+i.val,0));
  const past=ms.map((x,k)=>({x,v:outs[k]})).filter(o=>o.x<=last && o.v>0);
  const avg=past.length>=2? past.reduce((s,o)=>s+o.v,0)/past.length : 0;   // média só faz sentido com 2+ meses
  const hasIns=ins.some(v=>v>0);
  $("rMesesNote").textContent= lastAll>last? `de ${fmtM(first)} a ${fmtM(lastAll)} · depois de ${fmtM(last)} só o que já está comprometido` : `de ${fmtM(first)} a ${fmtM(last)}`;
  $("rMesesLeg").innerHTML=`${hasIns?'<span><i style="background:#2f8f57"></i>Entradas</span>':""}<span><i style="background:#b54728"></i>Gastos</span>${lastAll>last?'<span><i style="background:#e9b8a6"></i>Já comprometido (parcelas)</span>':""}${avg>0?`<span><i class="dash"></i>Média de gastos ${BRL.format(avg)}</span>`:""}`;
  const W=Math.max(300, box.clientWidth||760), H=W<520?230:280, pl=W<520?54:60, pr=10, pt=22, pb=30;
  const max=Math.max(...outs, ...ins, avg, 1), nice=niceMax(max*1.08), ih=H-pt-pb, bw=(W-pl-pr)/ms.length;
  const y=v=>pt+ih*(1-v/nice), fs=W<520?10:11, short=v=>v>=1000? (v/1000).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mil" : Math.round(v).toLocaleString("pt-BR");
  let s=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Entradas e gastos por mês">`;
  const kSel=ms.indexOf(sel); if(kSel>=0) s+=`<rect x="${pl+kSel*bw+2}" y="${pt-16}" width="${bw-4}" height="${ih+16}" rx="8" fill="#f1f5f3"/>`;
  [0,nice/2,nice].forEach(t=>{ s+=`<line x1="${pl}" x2="${W-pr}" y1="${y(t)}" y2="${y(t)}" stroke="#e8eeeb"/><text x="${pl-6}" y="${y(t)+4}" text-anchor="end" font-size="${fs}" fill="#62716b" font-family="JetBrains Mono, monospace">${short(t)}</text>`; });
  const step=Math.ceil(ms.length/(W<520?6:12)), nb=hasIns?2:1, w=Math.max(4,Math.min(hasIns?26:36,bw*0.72/nb)), gap=hasIns?3:0, lbl=bw>=(hasIns?54:30);
  const bar=(X,v,fill,stroke)=>{ const h=ih*v/nice, rr=Math.min(4,w/2,h); return h>0? `<path d="M${X},${y(0)}V${y(v)+rr}Q${X},${y(v)} ${X+rr},${y(v)}H${X+w-rr}Q${X+w},${y(v)} ${X+w},${y(v)+rr}V${y(0)}Z" fill="${fill}"${stroke?` stroke="${stroke}" stroke-width="1.5"`:""}/>` : ""; };
  const val=(X,v,col,bold)=>`<text x="${X+w/2}" y="${y(v)-5}" text-anchor="middle" font-size="${fs-1}" fill="${col}" font-weight="${bold?700:500}" font-family="JetBrains Mono, monospace" stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${short(v)}</text>`;
  ms.forEach((x,k)=>{ const fut=x>last, cx=pl+k*bw+bw/2, X0=cx-(nb*w+(nb-1)*gap)/2;
    let X=X0;
    if(hasIns){ if(ins[k]>0){ s+=bar(X,ins[k],"#2f8f57"); if(lbl||x===sel) s+=val(X,ins[k],"#1f6b3f",x===sel); } X+=w+gap; }
    if(outs[k]>0){ s+=bar(X,outs[k],fut?"#e9b8a6":"#b54728"); if(lbl||x===sel) s+=val(X,outs[k],fut?"#a5634c":"#8f3a20",x===sel); }
    if(k%step===0||x===sel) s+=`<text x="${cx}" y="${H-pb+16}" text-anchor="middle" font-size="${fs}" fill="${x===sel?"#1f2a27":"#62716b"}" font-weight="${x===sel?700:400}">${fmtM(x)}</text>`; });
  if(avg>0) s+=`<line x1="${pl}" x2="${W-pr}" y1="${y(avg)}" y2="${y(avg)}" stroke="#1f2a27" stroke-width="1.2" stroke-dasharray="5 4" opacity=".7"/><text x="${W-pr}" y="${y(avg)-4}" text-anchor="end" font-size="${fs-1}" fill="#1f2a27">média</text>`;
  ms.forEach((x,k)=>{ s+=`<rect class="hit" data-k="${k}" x="${pl+k*bw}" y="${pt}" width="${bw}" height="${ih}"/>`; });
  box.innerHTML=s+`</svg><div class="mtip" hidden></div>`;
  const tip=box.querySelector(".mtip");
  box.querySelectorAll(".hit").forEach(r=>{ const k=+r.dataset.k, x=ms[k];
    r.onmouseenter=r.onclick=()=>{ tip.innerHTML=`<b>${fmtMLong(x)}</b>${x>last?' <span class="muted">· comprometido</span>':""}<br>${hasIns?`Entradas <span class="num">${BRL.format(ins[k])}</span><br>`:""}Gastos <span class="num">${BRL.format(outs[k])}</span>${hasIns&&x<=last?`<br>Diferença <span class="num">${BRL.format(ins[k]-outs[k])}</span>`:""}${avg>0?`<br>Média <span class="num">${BRL.format(avg)}</span>`:""}`;
      tip.hidden=false; const sc=box.clientWidth/W, xr=(pl+(k+1)*bw)*sc+6, xl=(pl+k*bw)*sc-6-tip.offsetWidth; tip.style.top="4px"; tip.style.left=(xr+tip.offsetWidth<=box.clientWidth? xr : Math.max(0,xl))+"px"; };
    r.onmouseleave=()=>{ tip.hidden=true; };
    r.ondblclick=()=>{ selMonth=x; render(); }; });
}

// ---------------- cartões: ajustes + alertas ----------------
function cardKeys(){ const s=new Set(ITEMS.filter(i=>isCardItem(i)&&(!i.ign||i.terc)).map(i=>i.cardKey));
  Object.keys(state.cartoes).forEach(k=>{ if(state.cartoes[k]&&state.cartoes[k].manual) s.add(k); }); return [...s]; }
// cartão adicionado à mão (ex.: fatura em PDF que não dá para ler); reaproveita o que já existe com o mesmo nome e final
const semAc=t=>String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
function novoCartao(banco, fin, fech, venc){
  banco=String(banco||"").trim(); fin=String(fin||"").replace(/\D/g,"").slice(-4); if(!banco) return null;
  const dia=v=>{ v=parseInt(v,10); return v? Math.min(31,Math.max(1,v)) : ""; };
  const todos=new Set(Object.keys(state.cartoes).concat(cardKeys()));
  let key=[...todos].find(k=>{ const [b,f]=k.split("|"); return isCardKey(k) && semAc(b)===semAc(banco) && (f||"")===fin; }) || (banco+"|"+fin);
  const novo=!state.cartoes[key]; const c=state.cartoes[key]=state.cartoes[key]||{};
  if(novo || !ITEMS.some(i=>i.kind==="cartao"&&i.cardKey===key)) c.manual=true;
  if(dia(fech)) c.fech=dia(fech); if(dia(venc)) c.venc=dia(venc);
  if(selCards) selCards.add(key);
  return key;
}
function cardMissing(k){ const c=state.cartoes[k]||{}; const f=[]; if(c.terceiro) return f; if(!c.fech) f.push("fechamento"); if(!c.venc) f.push("vencimento"); return f; }
const inpS='font:inherit;padding:5px 7px;border:1px solid var(--line);border-radius:7px';
function fileLabel(n){ return String(n).split("/").pop(); }
function cardFiles(k){ return [...new Set(ITEMS.filter(i=>i.kind==="cartao"&&i.cardKey===k&&i.file).map(i=>i.file))]; }
function filesRowHTML(k, cols){
  if(!k.endsWith("|")) return "";
  const fl=cardFiles(k); if(!fl.length) return "";
  return `<tr class="filesrow"><td colspan="${cols}" class="full"><div class="afl"><span class="small muted">Sem número do cartão. Arquivos:</span>${fl.map(n=>`<label class="af"><span title="${esc(n)}">📄 ${esc(fileLabel(n))}</span><input data-af="${esc(n)}" inputmode="numeric" maxlength="4" placeholder="final" aria-label="Final do cartão do arquivo ${esc(fileLabel(n))}"></label>`).join("")}</div><span class="small muted">Se cada arquivo for de um cartão diferente, digite os 4 últimos números e eles viram cartões separados.</span></td></tr>`;
}
function cardCfgHTML(keys, withStatus){
  return keys.map(k=>{ const c=state.cartoes[k]||{}; const [b,f]=k.split("|"); const miss=cardMissing(k);
    return `<tr><td>${esc(b)} <span class="num">${esc(f||"")}</span></td><td data-l="Apelido"><input data-k="${esc(k)}" data-f="alias" value="${esc(c.alias||"")}" placeholder="${esc(b+(f?" "+f:""))}" style="width:9rem;${inpS}" aria-label="Apelido"></td>
      <td class="r" data-l="Fecha dia"><input class="num${c.fech?"":" need"}" data-k="${esc(k)}" data-f="fech" inputmode="numeric" value="${esc(c.fech||"")}" placeholder="dia" style="width:3.6rem;${inpS}" aria-label="Fecha dia"></td>
      <td class="r" data-l="Vence dia"><input class="num${c.venc?"":" need"}" data-k="${esc(k)}" data-f="venc" inputmode="numeric" value="${esc(c.venc||"")}" placeholder="dia" style="width:3.6rem;${inpS}" aria-label="Vence dia"></td>
      <td data-l="Quem paga"><select data-k="${esc(k)}" data-f="terceiro" aria-label="Quem paga este cartão" style="${inpS}"><option value=""${c.terceiro?"":" selected"}>Eu</option><option value="1"${c.terceiro?" selected":""}>Outra pessoa</option></select></td>
      ${withStatus?`<td data-l="Situação">${c.terceiro?'<span class="tag">fora da conta</span>':miss.length?`<span class="tag warn">falta ${miss.join(" e ")}</span>`:`<span class="tag in">ok</span>`}${c.manual?' <span class="tag man">adicionado à mão</span>':""}${c.manual&&!ITEMS.some(i=>isCardItem(i)&&i.cardKey===k)?` <button type="button" class="ghost sm" data-rmk="${esc(k)}">Remover</button>`:""}</td>`:""}</tr>${filesRowHTML(k, withStatus?6:5)}`; }).join("")||`<tr><td colspan="5" class="empty">Nenhum cartão ainda. Eles aparecem quando você carrega uma fatura, ou adicione um à mão.</td></tr>`;
}
function bindCardCfg(root){
  root.querySelectorAll("[data-rmk]").forEach(b=>b.onclick=()=>{ const k=b.dataset.rmk, old=state.cartoes[k]; delete state.cartoes[k]; save(); render();
    toast(`Cartão ${esc(cardName(k))} removido.`,[{label:"Desfazer",run:()=>{ state.cartoes[k]=old; save(); render(); }}]); });
  root.querySelectorAll("input[data-af]").forEach(inp=>inp.onchange=()=>{ const n=inp.dataset.af, v=inp.value.replace(/\D/g,"").slice(-4); if(!v) return;
    state.arqFinal=Object.assign(state.arqFinal||{},{[n]:v});
    const it=ITEMS.find(i=>i.kind==="cartao"&&i.file===n); if(it){ const oldK=it.bank+"|", newK=it.bank+"|"+v; if(state.cartoes[oldK] && !state.cartoes[newK]){ const o=state.cartoes[oldK]; state.cartoes[newK]={fech:o.fech||"",venc:o.venc||""}; } }
    save(); render(); toast(`${esc(fileLabel(n))} agora é o cartão final ${v}.`,[{label:"Desfazer",run:()=>{ delete state.arqFinal[n]; save(); render(); }}]); });
  root.querySelectorAll("select[data-f=terceiro]").forEach(sel=>sel.onchange=()=>{ const k=sel.dataset.k; state.cartoes[k]=state.cartoes[k]||{}; if(sel.value) state.cartoes[k].terceiro=true; else delete state.cartoes[k].terceiro; save(); render();
    toast(sel.value? `${esc(cardName(k))} agora é de outra pessoa: as compras dele saíram da sua conta.` : `${esc(cardName(k))} voltou para a sua conta.`); });
  root.querySelectorAll("input[data-f]").forEach(inp=>inp.onchange=()=>{ const k=inp.dataset.k,f=inp.dataset.f; state.cartoes[k]=state.cartoes[k]||{}; let v=inp.value.trim(); if(f!=="alias") v=v?Math.min(31,Math.max(1,parseInt(v,10)||0)):""; state.cartoes[k][f]=v; save(); render(); }); }
let alertHidden=false;
function alerts(){
  const pend=cardKeys().map(k=>({k,miss:cardMissing(k)})).filter(x=>x.miss.length);
  const n=pend.length; $("tBadge").hidden=!n; $("tBadge").textContent=n;
  const bar=$("alertBar");
  if(!n || alertHidden || tab==="dados"){ bar.hidden=true; return; }
  bar.innerHTML=`<span>⚠ <b>Falta preencher ${n===1?"1 cartão":n+" cartões"}:</b> ${pend.map(x=>`${esc(cardName(x.k))} (${x.miss.join(" e ")})`).join(" · ")}. Sem essas datas a fatura pode cair no mês errado.</span><span class="acts"><button type="button" class="primary" id="aGo">Preencher</button><button type="button" class="ghost" id="aX">Depois</button></span>`;
  bar.hidden=false; $("aGo").onclick=()=>go("dados"); $("aX").onclick=()=>{ alertHidden=true; bar.hidden=true; };
}

// ---------------- dados ----------------
function rDados(){
  const keys=cardKeys(), pend=keys.filter(k=>cardMissing(k).length);
  $("dAlertSum").textContent= pend.length? `${pend.length} pendente(s)` : "";
  $("dAlert").innerHTML= pend.length? `<div class="dalert">${pend.map(k=>{ const c=state.cartoes[k]||{};
      return `<div class="arow"><span class="an">⚠ ${esc(cardName(k))}</span><label>Fecha dia<input class="num${c.fech?"":" need"}" data-k="${esc(k)}" data-f="fech" inputmode="numeric" value="${esc(c.fech||"")}" placeholder="dia"></label><label>Vence dia<input class="num${c.venc?"":" need"}" data-k="${esc(k)}" data-f="venc" inputmode="numeric" value="${esc(c.venc||"")}" placeholder="dia"></label><span class="small muted">olhe na fatura ou no app do banco</span></div>`; }).join("")}</div>`
    : `<div class="aok">✓ Tudo preenchido: todos os cartões têm fechamento e vencimento.</div>`;
  bindCardCfg($("dAlert"));
  $("dCards").innerHTML=cardCfgHTML(keys,true); bindCardCfg($("dCards"));
  rCatsCfg(); rRules();
}
function grpSel(attr, val){ return `<select ${attr} aria-label="Grupo 50/30/20">${["nec","des","pou"].map(g=>`<option value="${g}"${g===val?" selected":""}>${GRP[g].nome}</option>`).join("")}</select>`; }
function rCatsCfg(){
  const X=extras(), desp=cfg.cats.filter(c=>c.tipo==="Despesa");
  const cur=$("dCat").value; $("dCat").innerHTML=desp.map(c=>`<option>${esc(c.nome)}</option>`).join(""); if(cur) $("dCat").value=cur;
  const isNew=n=>X.subs.some(e=>e.nome===n), used=n=>ITEMS.filter(i=>i.sub===n&&!i.ign).length;
  const open=new Set([...$("dCats").querySelectorAll("details[open]")].map(d=>d.dataset.c));
  $("dCatSum").textContent=`${desp.length} categorias · ${cfg.subs.length} subcategorias${X.subs.length?` · ${X.subs.length} novas`:""}${X.del.length?` · ${X.del.length} ocultas`:""}`;
  $("dCats").innerHTML=desp.map(c=>{ const subs=cfg.allSubs.filter(s=>s[1]===c.nome).map(s=>s[0]);
    return `<details data-c="${esc(c.nome)}"${open.has(c.nome)?" open":""}><summary><span>${esc(c.nome)}</span><span class="small muted">${subs.length} subcategorias</span></summary>
    ${subs.map(n=>{ const off=X.del.includes(n), nw=isNew(n), u=used(n);
      return `<div class="dsub${off?" off":""}"><span class="dn" data-dn="${esc(n)}">${esc(n)} ${nw?'<span class="tag learn">nova</span>':""}${origName(n)!==n?` <span class="tag info" title="Na planilha: ${esc(origName(n))}">renomeada</span>`:""}${X.mov[n]?' <span class="tag info">mudou de categoria</span>':""}</span><span class="small muted num">${u?u+"×":""}<span class="edt">editar ›</span></span>
      <span class="dctl"><select data-mv="${esc(n)}" aria-label="Categoria de ${esc(n)}">${desp.map(d=>`<option${d.nome===c.nome?" selected":""}>${esc(d.nome)}</option>`).join("")}</select>${grpSel(`data-mg="${esc(n)}"`, grpOf(c.nome,n))}
      <button type="button" class="ghost" data-dr="${esc(n)}">Renomear</button>${nw?`<button type="button" class="ghost" data-dx="${esc(n)}">Excluir</button>`:`<button type="button" class="ghost" data-dh="${esc(n)}">${off?"Mostrar":"Ocultar"}</button>`}</span></div>`; }).join("")}</details>`; }).join("");
  const R=$("dCats");
  R.querySelectorAll(".dsub").forEach(row=>{ const tog=e=>{ if(e.target.closest("select,button,input")) return; row.classList.toggle("open"); }; row.querySelector(".dn").onclick=tog; row.querySelector(".num").onclick=tog; });
  R.querySelectorAll("[data-mv]").forEach(sel=>sel.onchange=()=>{ const n=sel.dataset.mv; const e=X.subs.find(x=>x.nome===n); const on=origName(n); const orig= e? e.cat : ((state.cfg&&state.cfg.subs||DEFAULTS.subs).find(s=>s[0]===on)||[])[1];
    if(sel.value===orig) delete X.mov[n]; else X.mov[n]=sel.value; applyCfg(); save(); render(); toast(`“${esc(n)}” agora fica em ${esc(sel.value)}.`); });
  R.querySelectorAll("[data-mg]").forEach(sel=>sel.onchange=()=>{ metas().map["s:"+sel.dataset.mg]=sel.value; save(); render(); });
  R.querySelectorAll("[data-dr]").forEach(b=>b.onclick=()=>{ const n=b.dataset.dr; const span=[...R.querySelectorAll("[data-dn]")].find(x=>x.dataset.dn===n); if(!span) return;
    span.outerHTML=`<span class="ren"><input value="${esc(n)}" aria-label="Novo nome de ${esc(n)}"><button type="button" class="primary">Salvar</button><button type="button" class="ghost">Cancelar</button></span>`;
    const box=b.closest(".dsub").querySelector(".ren"), inp=box.querySelector("input"), [ok,no]=box.querySelectorAll("button");
    inp.focus(); inp.select(); ok.onclick=()=>renameSub(n, inp.value); no.onclick=()=>rCatsCfg();
    inp.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); renameSub(n, inp.value); } if(e.key==="Escape") rCatsCfg(); }; });
  R.querySelectorAll("[data-dh]").forEach(b=>b.onclick=()=>{ const n=b.dataset.dh; X.del=X.del.includes(n)? X.del.filter(x=>x!==n) : X.del.concat(n); applyCfg(); save(); render(); });
  R.querySelectorAll("[data-dx]").forEach(b=>b.onclick=()=>{ const n=b.dataset.dx; const rec=X.subs.find(x=>x.nome===n); X.subs=X.subs.filter(x=>x.nome!==n); delete X.mov[n]; applyCfg(); save(); render();
    toast(`Subcategoria “${esc(n)}” excluída.`,[{label:"Desfazer",run:()=>{ X.subs.push(rec); applyCfg(); save(); render(); }}]); });
}
function renameSub(old, nv){
  nv=String(nv||"").trim().replace(/\s+/g," "); if(!nv || nv===old){ rCatsCfg(); return; }
  if(cfg.allSubs.some(s=>s[0]!==old && s[0].toLowerCase()===nv.toLowerCase())){ toast(`Já existe uma subcategoria chamada “${esc(nv)}”.`); return; }
  const X=extras(), e=X.subs.find(x=>x.nome===old);
  if(e) e.nome=nv; else { const o=origName(old); if(nv===o) delete X.ren[o]; else X.ren[o]=nv; }
  if(X.mov[old]!=null){ X.mov[nv]=X.mov[old]; delete X.mov[old]; }
  X.del=X.del.map(x=>x===old?nv:x);
  const M=metas().map; if(M["s:"+old]){ M["s:"+nv]=M["s:"+old]; delete M["s:"+old]; }
  state.regras.forEach(r=>{ if(r.t===old) r.t=nv; });
  Object.values(state.edicoes).forEach(ed=>{ if(ed.sub===old) ed.sub=nv; });
  state.manuais.forEach(m=>{ if(m.sub===old) m.sub=nv; });
  applyCfg(); save(); render(); toast(`Renomeada: “${esc(old)}” agora é <b>${esc(nv)}</b>.`,[{label:"Desfazer",run:()=>renameSub(nv,old)}]);
}
$("dNew").onsubmit=e=>{ e.preventDefault(); const X=extras(); const nome=$("dName").value.trim().replace(/\s+/g," ");
  if(!nome){ return; } if(cfg.allSubs.some(s=>s[0].toLowerCase()===nome.toLowerCase())){ $("dMsg").textContent="Já existe uma subcategoria com esse nome."; return; }
  const kw=$("dKw").value.split(/[,;]/).map(x=>x.trim().toUpperCase()).filter(x=>x.length>=3);
  X.subs.push({nome,cat:$("dCat").value,grp:$("dGrp").value,kw,user:true}); applyCfg(); save(); render();
  $("dMsg").textContent=`Criada: ${nome} em ${$("dCat").value}${kw.length?`, reconhecendo ${kw.join(", ")}`:""}.`; $("dName").value=""; $("dKw").value=""; };
$("dCopy").onclick=async()=>{ const X=extras(); if(!X.subs.length && !Object.keys(X.ren).length){ $("dCopyMsg").textContent="Nenhuma subcategoria nova."; return; }
  const txt=X.subs.map(e=>e.nome+"\t"+(X.mov[e.nome]||e.cat)).join("\n")+"\n\n"+X.subs.flatMap(e=>(e.kw||[]).map(k=>k+"\t"+e.nome)).join("\n")+(Object.keys(X.ren).length?"\n\nRenomeadas (nome na planilha → novo nome)\n"+Object.entries(X.ren).map(([a,b])=>a+"\t"+b).join("\n"):"");
  try{ await navigator.clipboard.writeText(txt); $("dCopyMsg").textContent="Copiado: primeiro subcategoria + categoria (cole nas colunas de subcategorias da aba Cadastros), depois palavra-chave + subcategoria."; }catch(e){ $("dCopyMsg").textContent="Não consegui copiar sozinho neste navegador."; } };

// ---------------- metas 50/30/20 ----------------
const GRP={nec:{nome:"Necessidades",cor:"#17806b"},des:{nome:"Desejos",cor:"#c98a12"},pou:{nome:"Poupança e dívidas",cor:"#6a4fc0"}};
const DEF_SUB={"Assinaturas (Streaming, Nuvem, Apps)":"des","Cosméticos":"des","Cabeleireiro":"des","Vestuário":"des","Academia":"des","Outros (Pessoais)":"des","Lavagens":"des",
  "Remédios":"nec","Médicos e Terapeutas Esporádicos":"nec","Tarifas Bancárias":"nec","Manutenção e Reparos":"nec","Manutenção do Veículo":"nec","Ajuda aos Pais":"nec","Dedetização":"nec","Utilidades Domésticas e Decoração":"des"};
function defCat(c){ const n=c.nome, g=String(c.grupo||"");
  if(/D[IÍ]VIDA/i.test(n) || /invest/i.test(g) || /BOLETO PESSOAL/i.test(n)) return "pou";
  if(/essenc|educa/i.test(g)) return "nec"; if(/livre/i.test(g)) return "des";
  return /LAZER|OUTROS/i.test(n)?"des":"nec"; }
function metas(){ if(!state.metas) state.metas={pct:{nec:50,des:30,pou:20},renda:"",map:{}}; return state.metas; }
function grpCat(cat){ const M=metas().map; if(M["c:"+cat]) return M["c:"+cat]; const c=cfg.cats.find(x=>x.nome===cat); return c?defCat(c):"des"; }
function grpOf(cat,sub){ const M=metas().map; const e=extras().subs.find(x=>x.nome===sub); return M["s:"+sub] || M["c:"+cat] || (e&&e.grp) || DEF_SUB[origName(sub)] || DEF_SUB[sub] || grpCat(cat); }
function calcMetas(m){
  const cur=ITEMS.filter(i=>inM(i,m)); const ins=cur.filter(i=>!isOut(i)).reduce((s,i)=>s+i.val,0), outs=cur.filter(isOut).reduce((s,i)=>s+i.val,0);
  const Mt=metas(), P=Mt.pct, renda=parseValue(String(Mt.renda||""),false), base= renda>0? renda : ins;
  const v={nec:0,des:0,pou:0}; cur.filter(isOut).forEach(i=>{ v[grpOf(i.cat,i.sub||"")]+=i.val; });
  const sobra=Math.max(0,base-outs); v.pou+=sobra;
  const good={}; let ok=0; ["nec","des","pou"].forEach(g=>{ const lim=base*(+P[g]||0)/100; good[g]= g==="pou"? v[g]>=lim-0.005 : v[g]<=lim+0.005; if(good[g]) ok++; });
  return {base,renda,v,P,sobra,good,ok};
}
let selGrp=null;
function metasVisual(C, opts){
  const G=["nec","des","pou"], pc=g=>C.v[g]/C.base*100, tot=G.reduce((x,g)=>x+pc(g),0)||1;
  let acc=0; const refs=G.slice(0,2).map(g=>{ acc+=(+C.P[g]||0); return `<b style="left:calc(${Math.min(100,acc)}% - 1px)"></b>`; }).join("");
  return `<div class="ch"><b>${opts.title}</b><span>${C.ok} de 3 metas no caminho · traços = divisão ideal</span></div>
    <div class="stack" role="img" aria-label="Divisão da renda: ${G.map(g=>GRP[g].nome+" "+pc(g).toFixed(0)+"%").join(", ")}">${G.map(g=>`<i style="width:${pc(g)/Math.max(100,tot)*100}%;background:${GRP[g].cor}"></i>`).join("")}</div>
    <div class="ref" aria-hidden="true">${refs}</div>
    <div class="rows">${G.map(g=>{ const lim=C.base*(+C.P[g]||0)/100, d=lim-C.v[g];
      const st= g==="pou"? (C.good[g]?"meta batida":`faltam ${BRL.format(d)}`) : (C.good[g]?`cabem ${BRL.format(d)}`:`passou ${BRL.format(-d)}`);
      return `<button type="button" class="r1" data-g="${g}" aria-pressed="${opts.sel===g}" style="--gc:${GRP[g].cor}"><span class="n"><i style="background:${GRP[g].cor}"></i>${GRP[g].nome}</span><span class="p">${pc(g).toFixed(0)}% <small>/ ${+C.P[g]||0}%</small></span><span class="s ${C.good[g]?"ok":"bad"}">${st}</span><span class="go">${opts.sel===g?"fechar":"ver gastos"}</span></button>`; }).join("")}</div>`;
}
function coverMetas(m){
  const C=calcMetas(m), el=$("cvMetas");
  if(!(C.base>0)){ el.innerHTML=`<div class="ch"><b>Como estou no 50/30/20</b></div><p class="msg">Lance as entradas do mês (salário, Pix recebidos) para ver a divisão.</p>`; return; }
  el.innerHTML=metasVisual(C,{title:"Como estou no 50/30/20",sel:null});
  el.querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>{ selGrp=b.dataset.g; closeCover(); go("resumo"); setTimeout(()=>$("rMetas").scrollIntoView({behavior:"smooth",block:"start"}),80); });
}
function rMetas(m, cur, ins, outs){
  const C=calcMetas(m), {base,renda,v,P,sobra,ok}=C;
  $("mBase").textContent= base>0? `base: ${BRL.format(base)}${renda>0?" (renda informada)":" (entradas do mês)"}` : "";
  if(!(base>0)){ $("mHead").textContent=`Lance as entradas de ${fmtMLong(m)} (salário, Pix recebidos) ou informe a renda líquida em Ajustar metas para ver o 50/30/20.`; $("mGoals").innerHTML=""; $("mDet").hidden=true; return; }
  $("mHead").innerHTML=`${fmtMLong(m)}: ${ok===3?"mês equilibrado.":(v.des/base*100>(+P.des||0)?"os desejos estão acima do planejado.":v.nec/base*100>(+P.nec||0)?"as necessidades estão pesando mais que o planejado.":"ainda falta guardar para chegar na meta.")} Toque num grupo para ver os gastos dele.`;
  $("mGoals").innerHTML=metasVisual(C,{title:"Divisão da renda",sel:selGrp});
  $("mGoals").querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>{ selGrp= selGrp===b.dataset.g? null : b.dataset.g; rResumo(); });
  const det=$("mDet");
  if(!selGrp){ det.hidden=true; det.innerHTML=""; }
  else {
    const g=selGrp, list=cur.filter(i=>isOut(i)&&grpOf(i.cat,i.sub||"")===g), lim=base*(+P[g]||0)/100;
    const rows=group(list,i=>i.cat+"||"+(i.sub||""),i=>i.sub||i.cat,()=>GRP[g].cor);
    if(g==="pou" && sobra>0) rows.push({k:"sobra",label:"Sobrou no mês",v:sobra,n:0,c:"#a99be0"});
    rows.sort((a,b)=>b.v-a.v);
    det.hidden=false;
    det.innerHTML=`<div class="gdh"><h3><i style="background:${GRP[g].cor}"></i>${GRP[g].nome} em ${fmtMLong(m)}</h3><span class="small muted">${BRL.format(v[g])} de ${BRL.format(lim)} (meta ${+P[g]||0}%)</span></div>
      <div class="bars">${barsHTML(rows, v[g], {empty:"Nada neste grupo no mês."})}</div>
      ${list.length?`<div class="tablebox stack"><table><thead><tr><th>Data</th><th>Descrição</th><th>Onde / como</th><th>Categoria</th><th class="r">Valor</th></tr></thead><tbody>${list.slice().sort((a,b)=>b.val-a.val).map(i=>`<tr><td class="num" data-l="Data">${fmtD(i.date)}</td><td class="desc">${esc(i.desc)}</td><td data-l="Onde / como">${esc(i.kind==="cartao"?cardName(i.cardKey):i.meio)}</td><td data-l="Categoria">${esc(i.sub||i.cat)}</td><td class="r num" data-l="Valor">${BRL.format(i.val)}</td></tr>`).join("")}</tbody></table></div>`:""}
      <p class="small muted" style="margin:0">Alguma coisa no grupo errado? Mude em <b>Ajustar metas</b>, por categoria ou subcategoria.</p>`;
  }
  if(!$("mEditor").hidden) rMetaEditor();
}
function rMetaEditor(){
  const Mt=metas(), opt=sel=>["nec","des","pou"].map(g=>`<option value="${g}"${g===sel?" selected":""}>${GRP[g].nome}</option>`).join("");
  ["nec","des","pou"].forEach(g=>{ const el=$("mP"+g); if(document.activeElement!==el) el.value=Mt.pct[g]; });
  if(document.activeElement!==$("mRenda")) $("mRenda").value=Mt.renda||"";
  const open=new Set([...$("mMap").querySelectorAll("details[open]")].map(d=>d.dataset.c));
  $("mMap").innerHTML=cfg.cats.filter(c=>c.tipo==="Despesa").map(c=>{ const subs=subOptions(c.nome);
    return `<details data-c="${esc(c.nome)}"${open.has(c.nome)?" open":""}><summary><span>${esc(c.nome)}</span><select data-mc="${esc(c.nome)}" aria-label="Grupo de ${esc(c.nome)}">${opt(grpCat(c.nome))}</select></summary>
      ${subs.map(sb=>`<div class="sr"><span>${esc(sb)}</span><select data-ms="${esc(sb)}" data-of="${esc(c.nome)}" aria-label="Grupo de ${esc(sb)}">${opt(grpOf(c.nome,sb))}</select></div>`).join("")}</details>`; }).join("");
  $("mMap").querySelectorAll("[data-mc]").forEach(s=>{ s.onclick=e=>e.stopPropagation(); s.onchange=()=>{ const c=s.dataset.mc; Mt.map["c:"+c]=s.value; subOptions(c).forEach(sb=>delete Mt.map["s:"+sb]); save(); render(); }; });
  $("mMap").querySelectorAll("[data-ms]").forEach(s=>s.onchange=()=>{ Mt.map["s:"+s.dataset.ms]=s.value; save(); render(); });
}
["nec","des","pou"].forEach(g=>$("mP"+g).onchange=()=>{ const Mt=metas(); const v=Math.max(0,Math.min(100,parseInt($("mP"+g).value,10)||0)); Mt.pct[g]=v;
  const sum=Mt.pct.nec+Mt.pct.des+Mt.pct.pou; $("mMsg").textContent= sum===100? "" : `A soma está em ${sum}%. O ideal é fechar 100%.`; $("mMsg").style.color= sum===100?"":"var(--out)"; save(); render(); });
$("mRenda").onchange=()=>{ const t=$("mRenda").value.trim(); const v=parseValue(t,false); metas().renda= t&&v>0? String(v).replace(".",",") : ""; save(); render(); };
$("mReset").onclick=()=>{ state.metas={pct:{nec:50,des:30,pou:20},renda:"",map:{}}; $("mMsg").textContent="Metas voltaram para 50/30/20."; $("mMsg").style.color=""; save(); render(); };
$("mEdit").onclick=()=>{ const ed=$("mEditor"); ed.hidden=!ed.hidden; $("mEdit").setAttribute("aria-expanded",!ed.hidden); $("mEdit").textContent=ed.hidden?"Ajustar metas":"Fechar ajustes"; if(!ed.hidden) rMetaEditor(); };

function rCartoes(){
  const m=selMonth; const keys=cardKeys();
  if(!selCards) selCards=new Set(keys);
  const allOn=keys.every(k=>selCards.has(k));
  const sumK=k=>ITEMS.filter(i=>isCardItem(i)&&i.cardKey===k&&inM(i,m)).reduce((s,i)=>s+i.val,0);
  $("cChips").innerHTML=`<button type="button" class="chip" data-all="1" aria-pressed="${allOn}">Todos</button>`+keys.map(k=>`<button type="button" class="chip${(state.cartoes[k]||{}).terceiro?" terc":""}" data-k="${esc(k)}" aria-pressed="${selCards.has(k)}">${esc(cardName(k))}<span class="num">${(state.cartoes[k]||{}).terceiro?"outra pessoa":BRL.format(sumK(k))}</span></button>`).join("");
  $("cChips").querySelectorAll(".chip").forEach(b=>b.onclick=()=>{ if(b.dataset.all){ selCards=new Set(allOn?[]:keys); } else { const k=b.dataset.k; selCards.has(k)?selCards.delete(k):selCards.add(k); } render(); });
  const list=ITEMS.filter(i=>isCardItem(i)&&selCards.has(i.cardKey)&&inM(i,m));
  const tot=list.reduce((s,i)=>s+i.val,0);
  $("cTot").textContent=BRL.format(tot); $("cTotSub").textContent=selCards.size===keys.length?"todos os cartões":[...selCards].map(cardName).join(", ")||"nenhum cartão escolhido";
  $("cQtd").textContent=list.filter(i=>i.m===m && i.val>0).length;
  $("cParc").textContent=BRL.format(list.filter(i=>i.N>1).reduce((s,i)=>s+i.val,0));
  $("cNext").textContent=BRL.format(ITEMS.filter(i=>isCardItem(i)&&selCards.has(i.cardKey)&&inM(i,m+1)).reduce((s,i)=>s+i.val,0));
  $("cCats").innerHTML=barsHTML(group(list,i=>i.cat,null,i=>catColor(i.cat)), tot);
  $("cCfg").innerHTML=cardCfgHTML(keys,false); bindCardCfg($("cCfg"));
  const q=$("cQ").value.trim().toLowerCase();
  caRender(keys);
  const base=ITEMS.filter(i=>isCardItem(i)&&selCards.has(i.cardKey)&&(i.ign? i.m===m : inM(i,m)));
  const nRev=base.filter(needsReview).length; $("cRevN").textContent=nRev; if(revMode&&!nRev) revMode=false;
  const nEst=base.filter(i=>i.est).length; $("cEstN").textContent=nEst; $("cEst").hidden=!nEst; if(estMode&&!nEst) estMode=false;
  $("cAll").setAttribute("aria-pressed",!revMode&&!estMode); $("cRev").setAttribute("aria-pressed",revMode); $("cEst").setAttribute("aria-pressed",estMode);
  const all0=base.filter(i=>!revMode||needsReview(i)).filter(i=>!estMode||i.est).filter(i=>!q||i.desc.toLowerCase().includes(q)).sort((a,b)=>a.date-b.date);
  // compras e estornos que se anularam ficam escondidos na lista "Todas" (aparecem no filtro Estornos)
  const nZer= estMode? 0 : all0.filter(i=>i.est==="total").length, all= nZer? all0.filter(i=>i.est!=="total") : all0;
  $("cTx").innerHTML=all.map(i=>{ const proj=i.m<m, payIgn=i.ign && !i.terc && i.est!=="total" && !(state.edicoes[i.id]&&state.edicoes[i.id].ign);
    const par=i.estPar? `${esc(i.estPar.desc)} (${fmtD(i.estPar.date)}, ${BRL.format(Math.abs(i.estPar.val0))})` : "";
    const estTag= i.est==="total"? `<span class="tag est" title="${i.val0<0?"Devolve: ":"Devolvida por: "}${par}">↩ ${i.val0<0?"estorno":"estornada"}: zerado</span>`
      : i.est==="parcial"? `<span class="tag est" title="Abate de: ${par}">↩ estorno parcial</span>`
      : i.est==="sem"? `<span class="tag est" title="Não achei a compra devolvida nas faturas da pasta. O valor continua abatendo os gastos.">↩ estorno sem compra</span>` : "";
    const naoEst= i.est? `<button type="button" class="ghost sm" data-ne="${esc(i.id)}" title="Não é estorno: contar normalmente">Não é estorno</button>` : (state.edicoes[i.id]&&state.edicoes[i.id].naoEst)? `<button type="button" class="ghost sm" data-se="${esc(i.id)}" title="Voltar a procurar o estorno desta compra">É estorno</button>` : "";
    const dot= i.ign? "" : i.edited? '<span class="dot info" title="alterado por você"></span>' : i.how==="regra"? `<span class="dot learn" title="aprendido: contém “${esc(i.rk)}”"></span>` : (i.how==="palpite"||i.how==="padrao")? `<span class="dot warn" title="${i.how==="palpite"?"palpite por lojas parecidas":"sem regra"}"></span>` : "";
    const man= i.kind==="manual"? `<span class="tag man" title="Lançada por você">à mão</span><button type="button" class="ghost sm" data-mdel="${esc(i.id)}" title="Excluir este lançamento e todas as parcelas">Excluir</button>` : "";
    return `<tr class="${i.ign?"ign":proj?"proj":""}"><td class="stk"><div class="dsc" title="${esc(i.desc)}">${dot}<span class="t">${esc(i.desc)}</span></div></td>
    <td class="v">${i.ign? fmtNum(i.val) : `<input class="num${i.val!==i.val0?" part":""}" data-v="${esc(i.id)}" inputmode="decimal" value="${fmtNum(i.val)}" title="${i.val!==i.val0?`Sua parte. Valor na fatura: ${fmtNum(i.val0)}`:"Toque para mudar o valor (ex.: só a sua parte)"}" aria-label="Valor que você paga">`}</td>
    <td>${i.terc?'<span class="sm">cartão de outra pessoa</span>':payIgn?'<span class="sm">pagamento da fatura</span>':i.est==="total"?`<div class="cs">${estTag}${naoEst}</div>`:`<div class="cs">${estTag}${catSubSelect(i)}${man}${naoEst}${needsReview(i)?`<button type="button" class="okb" data-ok="${esc(i.id)}" title="A categoria está certa: guardar como regra" aria-label="Confirmar categoria">✓</button>`:""}</div>`}</td>
    <td class="ck"><input type="checkbox" data-ck="${esc(i.id)}" ${i.ign?"":"checked"} ${payIgn||i.terc||i.est==="total"?"disabled":""} aria-label="Eu pago esta compra"></td>
    <td class="sm num">${fmtD(i.date)}</td><td class="sm" title="${esc(i.file||"")}">${esc(cardName(i.cardKey))}${i.cardKey.endsWith("|")&&i.file?` <span class="fn">· ${esc(fileLabel(i.file))}</span>`:""}</td><td class="sm num">${i.N>1?(i.n+(m-i.m))+"/"+i.N:"—"}</td></tr>`; }).join("")||`<tr><td colspan="7" class="empty">${revMode?"Nada para revisar.":estMode?"Nenhum estorno.":"Nenhuma compra para os cartões escolhidos neste mês."}</td></tr>`;
  if(nZer) $("cTx").insertAdjacentHTML("beforeend",`<tr class="zerinfo"><td colspan="7"><button type="button" class="linkbtn" id="cZerShow">↩ ${nZer} lançamento(s) zerados por estorno escondidos · ver</button></td></tr>`);
  if($("cZerShow")) $("cZerShow").onclick=()=>{ estMode=true; revMode=false; rCartoes(); };
  bindCatSelects($("cTx"));
  $("cTx").querySelectorAll("[data-mdel]").forEach(b=>b.onclick=()=>{ const id=b.dataset.mdel, rec=state.manuais.find(x=>x.id===id); if(!rec) return;
    state.manuais=state.manuais.filter(x=>x.id!==id); save(); render(); toast(`Excluído: ${esc(rec.desc)}.`,[{label:"Desfazer",run:()=>{ state.manuais.push(rec); save(); render(); }}]); });
  $("cTx").querySelectorAll("[data-ne],[data-se]").forEach(b=>b.onclick=()=>{ const id=b.dataset.ne||b.dataset.se, it=ITEMS.find(x=>x.id===id); if(!it) return;
    const ids=b.dataset.ne? ITEMS.filter(x=>x.estGrp&&x.estGrp===it.estGrp).map(x=>x.id) : [id]; if(!ids.length) ids.push(id);
    ids.forEach(k=>{ state.edicoes[k]=state.edicoes[k]||{}; if(b.dataset.ne) state.edicoes[k].naoEst=true; else delete state.edicoes[k].naoEst; });
    save(); render(); toast(b.dataset.ne? "Ok, não é estorno: voltou a contar normalmente." : "Vou procurar o estorno desta compra de novo.",[{label:"Desfazer",run:()=>{ ids.forEach(k=>{ const e=state.edicoes[k]; if(!e) return; if(b.dataset.ne) delete e.naoEst; else e.naoEst=true; }); save(); render(); }}]); });
  $("cTx").querySelectorAll("[data-v]").forEach(inp=>inp.onchange=()=>{ const id=inp.dataset.v, it=ITEMS.find(x=>x.id===id); if(!it) return; const v=parseValue(inp.value,false);
    if(isNaN(v)||v<0){ inp.value=fmtNum(it.val); return; }
    state.edicoes[id]=state.edicoes[id]||{}; if(Math.abs(v-it.val0)<0.005) delete state.edicoes[id].val; else state.edicoes[id].val=Math.round(v*100)/100;
    if(v===0){ delete state.edicoes[id].val; state.edicoes[id].ign=true; }
    save(); render(); toast(v===0? "Compra removida da sua conta." : Math.abs(v-it.val0)<0.005? "Valor original de volta." : `Agora conta só ${BRL.format(v)} (sua parte) de ${BRL.format(it.val0)}.`,[{label:"Desfazer",run:()=>{ const e=state.edicoes[id]; if(e){ delete e.val; delete e.ign; } save(); render(); }}]); });
  $("cTx").querySelectorAll("[data-ck]").forEach(c=>c.onchange=()=>{ const id=c.dataset.ck; if(!c.checked){ state.edicoes[id]=Object.assign(state.edicoes[id]||{},{ign:true}); toast("Compra removida da sua conta: não é paga por você.",[{label:"Desfazer",run:()=>{ delete state.edicoes[id].ign; save(); render(); }}]); } else if(state.edicoes[id]) delete state.edicoes[id].ign; save(); render(); });
}
$("cQ").oninput=()=>rCartoes();
$("cAll").onclick=()=>{ revMode=false; estMode=false; rCartoes(); };
$("cRev").onclick=()=>{ revMode=true; estMode=false; rCartoes(); };
$("cEst").onclick=()=>{ estMode=true; revMode=false; rCartoes(); };
// ---- lançar compra no cartão (cartão sem fatura legível, compras antigas parceladas) ----
let caSel=null;
function caRender(keys){
  const sel=$("caCard"), cur=caSel && (keys.includes(caSel)||caSel==="__novo")? caSel : (keys.find(k=>state.cartoes[k]&&state.cartoes[k].manual)||keys[0]||"__novo");
  sel.innerHTML=keys.map(k=>`<option value="${esc(k)}">${esc(cardName(k))}</option>`).join("")+`<option value="__novo">+ Novo cartão…</option>`; sel.value=cur; caSel=cur;
  const cs=$("caCs"), cv=cs.value; cs.innerHTML=`<option value="">automática pela descrição</option>`+catOptions(null,null,false); cs.value=cv||"";
  if(!$("caDate").value) $("caDate").value=isoD(new Date());
  caPrev();
}
function caDados(){
  const N=Math.max(1,Math.min(72,parseInt($("caParc").value,10)||1)), pat=parseInt($("caPat").value,10)||0;
  const v=parseValue($("caVal").value,false), val= isNaN(v)||v<=0? 0 : Math.round(($("caValTipo").value==="t"? Math.abs(v)/N : Math.abs(v))*100)/100;
  return {N, pat, val, total:isNaN(v)?0:Math.abs(v)};
}
function caPrev(){
  const novo=$("caCard").value==="__novo"; $("caNovo").hidden=!novo;
  $("caPatHint").textContent=`nesta fatura (${fmtM(selMonth)})`;
  const {N,pat,val}=caDados(), d=$("caDate").value; let txt="";
  if(pat>N) txt=`<span class="warn">A parcela atual (${pat}) não pode ser maior que o total de parcelas (${N}).</span>`;
  else if(val>0 && d){
    let m0;
    if(pat>1) m0=selMonth-(pat-1);
    else { const k=novo? "__tmp" : $("caCard").value, cc=novo? {[k]:{fech:+$("caFech").value||0,venc:+$("caVenc").value||0}} : state.cartoes;
      const it={cardKey:k,date:new Date(d+"T12:00:00"),n:1,N:1,parcData:"S",desc:"",val:0}; computeMonths([it],cc); m0=it.m; }
    const ini= pat>1? selMonth : m0, fim=m0+N-1;
    txt= N>1? `${N}x de <b>${BRL.format(val)}</b> · ${pat>1?`faltam ${N-pat+1} parcelas, `:""}de ${fmtM(ini)} até ${fmtM(fim)}` : `<b>${BRL.format(val)}</b> na fatura de ${fmtM(ini)}`;
    if(!novo && cardMissing($("caCard").value).length) txt+=` · <span class="warn">preencha fechamento e vencimento do cartão para cair no mês certo</span>`;
  }
  $("caPrev").innerHTML=txt;
}
["caCard","caDate","caVal","caValTipo","caParc","caPat","caFech","caVenc"].forEach(id=>{ $(id).addEventListener("input",()=>{ if(id==="caCard") caSel=$("caCard").value; caPrev(); }); });
$("cAdd").onsubmit=e=>{ e.preventDefault();
  const {N,pat,val}=caDados(), desc=$("caDesc").value.trim(), date=$("caDate").value;
  if(!desc||!date||!(val>0)){ toast("Preencha data, descrição e valor."); return; }
  if(pat>N){ toast("A parcela atual não pode ser maior que o total de parcelas."); return; }
  let key=$("caCard").value;
  if(key==="__novo"){ key=novoCartao($("caBanco").value,$("caFin").value,$("caFech").value,$("caVenc").value); if(!key){ toast("Escreva o nome do cartão ou banco."); $("caBanco").focus(); return; } }
  let cat, sub; const cs=$("caCs").value;
  if(cs){ [cat,sub]=cs.split("||"); learnRule(desc,cat,sub); } else { const c=categorize(desc,"",cfg,state.regras); cat=c.cat; sub=c.sub; }
  const rec={id:"m:"+Date.now().toString(36)+Math.random().toString(36).slice(2,6), date, desc, tipo:"Saída", cat, sub:sub||"", meio:key, val, parc:N, origem:"manual"};
  if(pat>1){ rec.pAt=pat; rec.mesP=selMonth; }
  state.manuais.push(rec); if(state.seed) state.seed=false; if(selCards) selCards.add(key); caSel=key;
  ["caDesc","caVal","caParc","caPat","caBanco","caFin","caFech","caVenc"].forEach(id=>$(id).value=""); $("caCs").value="";
  save(); render();
  toast(`Lançado em ${esc(cardName(key))}: ${esc(desc)}${N>1?`, ${N}x de ${BRL.format(val)}`:`, ${BRL.format(val)}`}.`,[{label:"Desfazer",run:()=>{ state.manuais=state.manuais.filter(x=>x.id!==rec.id); save(); render(); }}]);
  setTimeout(()=>$("caDesc").focus(),30);
};
$("dNovo").onsubmit=e=>{ e.preventDefault();
  const key=novoCartao($("dnBanco").value,$("dnFin").value,$("dnFech").value,$("dnVenc").value); if(!key) return;
  ["dnBanco","dnFin","dnFech","dnVenc"].forEach(id=>$(id).value=""); caSel=key; save(); render();
  toast(`Cartão ${esc(cardName(key))} pronto. Lance as compras em Cartões.`,[{label:"Ir para Cartões",run:()=>{ go("cartoes"); $("cAddBox").open=true; $("cAddBox").scrollIntoView({behavior:"smooth",block:"start"}); }}]); };
// aviso de estornos do mês (Resumo e Cartões)
function estAviso(){
  const bar=$("estBar"), m=selMonth;
  const list=ITEMS.filter(i=>i.est && i.val0<0 && i.m===m);
  if(!list.length || (tab!=="resumo"&&tab!=="cartoes")){ bar.hidden=true; return; }
  const tot=list.filter(i=>i.est==="total" && !(i.estPar && /revers/i.test(i.estPar.desc))), par=list.filter(i=>i.est==="parcial"), sem=list.filter(i=>i.est==="sem");
  const parts=[];
  if(tot.length) parts.push(`<b>${tot.length===1?"1 compra estornada":tot.length+" compras estornadas"}</b> (${BRL.format(tot.reduce((s,i)=>s-i.val0,0))}): a compra e o estorno foram <b>zerados</b>`);
  if(par.length) parts.push(`${par.length===1?"1 estorno parcial":par.length+" estornos parciais"} (${BRL.format(par.reduce((s,i)=>s-i.val0,0))}) abatendo da compra original`);
  if(sem.length) parts.push(`${sem.length===1?"1 estorno":sem.length+" estornos"} sem a compra nas faturas da pasta (${BRL.format(sem.reduce((s,i)=>s-i.val0,0))}), abatendo dos gastos`);
  bar.innerHTML=`<span>↩ <b>Estornos neste mês:</b> ${parts.join("; ")}.</span><span class="acts"><button type="button" class="primary" id="estGo">Ver</button></span>`;
  bar.hidden=false; $("estGo").onclick=()=>{ estMode=true; revMode=false; selCards=null; go("cartoes"); const pn=$("cTx").closest(".panel"); if(pn) pn.scrollIntoView({behavior:"smooth",block:"start"}); };
}

function rAnalise(){
  const m=selMonth, cur=ITEMS.filter(i=>inM(i,m)&&isOut(i));
  const cats=group(cur,i=>i.cat,null,i=>catColor(i.cat));
  if(!selCat || !cats.some(c=>c.k===selCat)) selCat=cats[0]?cats[0].k:null;
  $("aChips").innerHTML=cats.map(c=>`<button type="button" class="chip" data-k="${esc(c.k)}" aria-pressed="${c.k===selCat}">${esc(c.k)}<span class="num">${BRL.format(c.v)}</span></button>`).join("")||`<span class="empty">Nenhum gasto neste mês.</span>`;
  $("aChips").querySelectorAll(".chip").forEach(b=>b.onclick=()=>{ selCat=b.dataset.k; render(); });
  const list=cur.filter(i=>i.cat===selCat), tot=list.reduce((s,i)=>s+i.val,0), col=catColor(selCat);
  $("aSubTitle").textContent=selCat? `Subcategorias de ${selCat}` : "Subcategorias";
  $("aSubs").innerHTML=barsHTML(group(list,i=>i.sub||"(sem subcategoria)",null,()=>col), tot);
  $("aMerTitle").textContent=selCat? `Onde mais gastou em ${selCat}` : "Onde mais gastou";
  const mers=group(list,i=>i.kind==="manual"?i.desc.toUpperCase():merchant(i.desc)).slice(0,10).map(r=>Object.assign(r,{label:r.k+(r.n>1?` (${r.n}×)`:""),c:col}));
  $("aMers").innerHTML=barsHTML(mers, tot);
  // trend
  const ms=monthsAll().filter(x=>x<=m+3).slice(-12);
  const subsAll=[...new Set(ITEMS.filter(i=>i.cat===selCat&&isOut(i)).map(i=>i.sub||"(sem subcategoria)"))];
  const vals=ms.map(x=>ITEMS.filter(i=>inM(i,x)&&isOut(i)&&i.cat===selCat).reduce((s,i)=>s+i.val,0));
  $("aTrendTitle").textContent=selCat? `${selCat} mês a mês` : "Mês a mês";
  $("aTrendNote").textContent="meses depois do atual mostram só parcelas já conhecidas";
  $("aTrend").innerHTML=trendSVG(ms, vals, m, col);
  $("aListTitle").textContent=selCat? `Lançamentos de ${selCat} em ${fmtMLong(m)}` : "Lançamentos";
  $("aTx").innerHTML=list.sort((a,b)=>b.val-a.val).map(i=>`<tr><td class="num" data-l="Data">${fmtD(i.date)}</td><td data-l="Onde / como">${esc(i.kind==="cartao"?cardName(i.cardKey):i.meio)}</td><td class="desc">${esc(i.desc)}</td><td data-l="Subcategoria">${esc(i.sub||"—")}</td><td class="r num" data-l="Valor">${BRL.format(i.val)}</td></tr>`).join("")||`<tr><td colspan="5" class="empty">Nada nesta categoria.</td></tr>`;
}
function trendSVG(ms, vals, cur, col){
  if(!ms.length) return `<div class="empty">Sem dados.</div>`;
  const W=760,H=220,pl=56,pr=10,pt=14,pb=34, max=Math.max(...vals,1), nice=niceMax(max);
  const bw=(W-pl-pr)/ms.length, ticks=[0,nice/2,nice];
  let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto por mês">`;
  ticks.forEach(t=>{ const y=pt+(H-pt-pb)*(1-t/nice); s+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${pl-6}" y="${y+4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="JetBrains Mono, monospace">${Math.round(t).toLocaleString("pt-BR")}</text>`; });
  ms.forEach((x,i)=>{ const h=(H-pt-pb)*(vals[i]/nice), w=Math.min(bw*0.64,56), X=pl+i*bw+(bw-w)/2, Y=H-pb-h;
    s+=`<rect x="${X}" y="${Y}" width="${w}" height="${Math.max(0,h)}" rx="3" fill="${col}" opacity="${x===cur?1:(x>cur?0.35:0.6)}"><title>${fmtMLong(x)}: ${BRL.format(vals[i])}</title></rect>`;
    s+=`<text x="${X+w/2}" y="${H-pb+16}" text-anchor="middle" font-size="11" fill="${x===cur?"var(--ink)":"var(--muted)"}" font-weight="${x===cur?700:400}">${fmtM(x)}</text>`;
    if(x===cur&&vals[i]) s+=`<text x="${X+w/2}" y="${Y-5}" text-anchor="middle" font-size="11" fill="var(--ink)" font-family="JetBrains Mono, monospace">${Math.round(vals[i]).toLocaleString("pt-BR")}</text>`; });
  return s+"</svg>";
}
function niceMax(v){ const p=Math.pow(10,Math.floor(Math.log10(v))); const n=v/p; return (n<=1?1:n<=2?2:n<=5?5:10)*p; }

// ---------------- lançamentos ----------------
function fillCatSelect(){
  const tipoOk=c=> lTipo==="Entrada"? c.tipo!=="Despesa" : c.tipo==="Despesa";
  const cur=$("lCat").value; const cats=cfg.cats.filter(tipoOk);
  $("lCat").innerHTML=cats.map(c=>`<option>${esc(c.nome)}</option>`).join(""); if(cats.some(c=>c.nome===cur)) $("lCat").value=cur;
  fillSubSelect();
}
function fillSubSelect(){ const cur=$("lSub").value; const subs=subOptions($("lCat").value); $("lSub").innerHTML=(subs.length?subs:[""]).map(s=>`<option value="${esc(s)}">${esc(s||"—")}</option>`).join(""); if(subs.includes(cur)) $("lSub").value=cur; }
function fillMeio(){ const cur=$("lMeio").value; const cards=cardKeys();
  $("lMeio").innerHTML=DEFAULTS.meios.map(x=>`<option>${esc(x)}</option>`).join("")+(cards.length?`<optgroup label="Cartões">${cards.map(k=>`<option value="${esc(k)}">${esc(cardName(k))}</option>`).join("")}</optgroup>`:""); if(cur) $("lMeio").value=cur; }
function setTipo(t){ lTipo=t; $("lOut").setAttribute("aria-pressed",t==="Saída"); $("lIn").setAttribute("aria-pressed",t==="Entrada"); fillCatSelect(); }
$("lOut").onclick=()=>setTipo("Saída"); $("lIn").onclick=()=>setTipo("Entrada");
$("lCat").onchange=()=>{ catTouched=true; $("lHint").textContent=""; fillSubSelect(); };
$("lSub").onchange=()=>{ catTouched=true; $("lHint").textContent=""; };
$("lDesc").oninput=()=>{ if(catTouched||lTipo!=="Saída"||editingId) return; const d=$("lDesc").value.trim(); if(d.length<3){ $("lHint").textContent=""; return; }
  const c=categorize(d,"",cfg,state.regras); if(c.how==="padrao"){ $("lHint").textContent=""; return; }
  $("lCat").value=c.cat; fillSubSelect(); $("lSub").value=c.sub||""; $("lHint").textContent= c.how==="regra"?"✓ pelo que você ensinou" : c.how==="palavra"?"✓ pela lista da planilha" : "palpite por lojas parecidas"; };
function resetForm(){ editingId=null; catTouched=false; if($("lHint")) $("lHint").textContent=""; $("lTitle").textContent="Novo lançamento"; $("lSave").textContent="Adicionar"; $("lCancel").hidden=true; $("lDel").hidden=true;
  $("lDesc").value=""; $("lVal").value=""; $("lParc").value=""; const t=new Date(); const inMonth=monthIndex(t)===selMonth; $("lDate").value=isoD(inMonth?t:new Date(Math.floor(selMonth/12),selMonth%12,1)); }
let lDraft={};
function meioOptions(sel){ const cards=cardKeys(); const v=sel||"Pix";
  return DEFAULTS.meios.map(x=>`<option${x===v?" selected":""}>${esc(x)}</option>`).join("")+(cards.length?`<optgroup label="Cartões">${cards.map(k=>`<option value="${esc(k)}"${k===v?" selected":""}>${esc(cardName(k))}</option>`).join("")}</optgroup>`:""); }
function lRowHTML(r, isNew){
  const tipo=r.tipo||"Saída", ent=tipo==="Entrada";
  return `<tr class="${isNew?"newrow":""}" data-id="${isNew?"":esc(r.id)}">
    <td class="stk"><input data-f="desc" value="${esc(r.desc||"")}" placeholder="${isNew?"+ Novo: descrição":"Descrição"}" aria-label="Descrição"></td>
    <td class="v ${ent?"in":"out"}"><input class="num" data-f="val" inputmode="decimal" value="${r.val?fmtNum(r.val):""}" placeholder="0,00" aria-label="Valor"></td>
    <td><input type="date" data-f="date" value="${esc(r.date||"")}" aria-label="Data"></td>
    <td><select data-f="tipo" aria-label="Tipo"><option${!ent?" selected":""}>Saída</option><option${ent?" selected":""}>Entrada</option></select></td>
    <td><select data-f="cs" aria-label="Categoria e subcategoria">${(isNew&&!r.cat)?`<option value="" selected>${ent?"escolha a categoria":"automática pela descrição"}</option>`:""}${catOptions(r.cat, r.sub||"", ent)}</select></td>
    <td><select data-f="meio" aria-label="Pago com">${meioOptions(r.meio)}</select></td>
    <td><input type="number" data-f="parc" min="1" max="72" value="${r.parc>1?r.parc:""}" placeholder="1" style="width:4.2rem" aria-label="Parcelas"></td>
    <td>${isNew?"":`<button type="button" class="del" data-del title="Excluir" aria-label="Excluir lançamento">×</button>`}</td></tr>`;
}
function rLanc(){
  const m=selMonth; const list=ITEMS.filter(i=>i.kind==="manual"&&inM(i,m)).sort((a,b)=>a.date-b.date);
  const ins=list.filter(i=>!isOut(i)).reduce((s,i)=>s+i.val,0), outs=list.filter(isOut).reduce((s,i)=>s+i.val,0);
  $("lSum").textContent=`Entradas ${BRL.format(ins)} · Saídas ${BRL.format(outs)}`;
  if(!lDraft.date){ const t=new Date(); lDraft.date=isoD(monthIndex(t)===m? t : new Date(Math.floor(m/12),m%12,1)); }
  const recs=list.map(i=>state.manuais.find(x=>x.id===i.id)).filter(Boolean);
  $("lTx").innerHTML=lRowHTML(lDraft,true)+recs.map(r=>lRowHTML(r,false)).join("");
  const sug=[...new Set(state.manuais.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>x.desc).filter(Boolean))].slice(0,300);
  $("lSug").innerHTML=sug.map(d=>`<option value="${esc(d)}"></option>`).join("");
  $("lTx").querySelectorAll("tr").forEach(tr=>{
    const id=tr.dataset.id, isNew=!id;
    tr.querySelectorAll("[data-f]").forEach(el=>el.onchange=()=>lCell(isNew?null:id, el.dataset.f, el.value, tr));
    if(isNew){ const d=tr.querySelector("[data-f=desc]"); d.setAttribute("list","lSug"); d.setAttribute("autocomplete","off");
      d.oninput=()=>{ lDraft.desc=d.value.trim(); if(!lDraft.csTouched){ delete lDraft.cat; delete lDraft.sub; } lAjuda(); };
      tr.querySelector("[data-f=val]").oninput=()=>lAjuda(); }
    const d=tr.querySelector("[data-del]"); if(d) d.onclick=()=>{ const rec=state.manuais.find(x=>x.id===id); state.manuais=state.manuais.filter(x=>x.id!==id); save(); render(); toast("Lançamento excluído.",[{label:"Desfazer",run:()=>{ state.manuais.push(rec); save(); render(); }}]); };
  });
  lAjuda();
}
function lCell(id, f, v, tr){
  const r= id? state.manuais.find(x=>x.id===id) : lDraft; if(!r) return;
  if(f==="val"){ const n=parseValue(v,false); r.val= isNaN(n)? 0 : Math.abs(n); }
  else if(f==="parc"){ r.parc=Math.max(1,parseInt(v,10)||1); }
  else if(f==="cs"){ if(!v){ delete r.cat; delete r.sub; r.csTouched=false; } else { const [c,sb]=v.split("||"); r.cat=c; r.sub=sb; r.csTouched=true;
      if(id && (r.tipo||"Saída")==="Saída" && r.desc){ const L=learnRule(r.desc,c,sb); if(L) toast(`Aprendido: “${esc(L.mk)}” vai para <b>${esc(sb||c)}</b>.`); } } }
  else if(f==="tipo"){ r.tipo=v; delete r.cat; delete r.sub; r.csTouched=false; }
  else { r[f]= f==="desc"? v.trim() : v; if(f==="meio") r.meioTouched=true; }
  if(id && f==="tipo"){ const ent=v==="Entrada"; const c=cfg.cats.find(x=>ent? x.tipo!=="Despesa" : x.tipo==="Despesa"); r.cat=c?c.nome:""; r.sub=(subOptions(r.cat)[0])||""; }
  if(id){ if(r.origem==="planilha") r.alterado=true; if(state.seed) state.seed=false; save(); render(); return; }
  // linha nova: vira lançamento quando tem descrição e valor
  if(f==="desc" && !r.csTouched && (r.tipo||"Saída")==="Saída" && r.desc){ const c=categorize(r.desc,"",cfg,state.regras); if(c.how!=="padrao"){ r.cat=c.cat; r.sub=c.sub; } }
  if(f==="desc") lLembrar(r, tr);
  if(!lCommit()){
    // atualiza só a linha nova sem perder o foco
    const cs=tr.querySelector("[data-f=cs]"); if(f!=="cs" && (f==="tipo"||f==="desc")){ cs.innerHTML=(r.cat?"":`<option value="" selected>${(r.tipo||"Saída")==="Entrada"?"escolha a categoria":"automática pela descrição"}</option>`)+catOptions(r.cat,r.sub||"",(r.tipo||"Saída")==="Entrada"); }
    const vc=tr.querySelector("td.v"); vc.className="v "+((r.tipo||"Saída")==="Entrada"?"in":"out");
    lAjuda();
  }
}
function lCommit(){
  const r=lDraft;
  if(r.desc && r.val>0){
    const tipo=r.tipo||"Saída";
    if(!r.cat){ if(tipo==="Saída"){ const c=categorize(r.desc,"",cfg,state.regras); r.cat=c.cat; r.sub=c.sub; } else { const c=cfg.cats.find(x=>x.tipo!=="Despesa"); r.cat=c?c.nome:""; r.sub=(subOptions(r.cat)[0])||""; } }
    const rec={id:"m:"+Date.now().toString(36)+Math.random().toString(36).slice(2,6), date:r.date, desc:r.desc, tipo, cat:r.cat, sub:r.sub||"", meio:r.meio||"Pix", val:r.val, parc:r.parc||1, origem:"manual"};
    if(r.csTouched && tipo==="Saída") learnRule(rec.desc, rec.cat, rec.sub);
    state.manuais.push(rec); if(state.seed) state.seed=false; const keepDate=r.date; lDraft={date:keepDate}; save(); render();
    toast(`Lançado: ${esc(rec.desc)}, ${BRL.format(rec.val)} em ${esc(rec.sub||rec.cat)}.`);
    setTimeout(()=>{ const i=$("lTx").querySelector("tr.newrow [data-f=desc]"); if(i) i.focus(); },30);
    return true;
  }
  return false;
}
// ---- ajuda no preenchimento ----
const lNorm=t=>String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
const recM=r=>{ const p=String(r.date||"").split("-"); return p.length===3? (+p[0])*12+(+p[1]-1) : null; };
function lUltimo(desc){ const k=lNorm(desc); if(!k) return null; return state.manuais.filter(x=>lNorm(x.desc)===k).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]||null; }
function lLembrar(r, tr){
  // descrição igual a um lançamento anterior: copia tipo, categoria e meio; sugere o último valor
  delete r.sugVal; const u=lUltimo(r.desc); if(!u) return;
  r.tipo=u.tipo||"Saída"; if(!r.csTouched){ r.cat=u.cat; r.sub=u.sub||""; } if(!r.meioTouched) r.meio=u.meio||"Pix"; if(!(r.parc>1) && u.parc>1) r.parc=u.parc;
  if(!(r.val>0)) r.sugVal=u.val;
  if(tr){ const q=f=>tr.querySelector(`[data-f=${f}]`); q("tipo").value=r.tipo; q("cs").innerHTML=catOptions(r.cat,r.sub||"",r.tipo==="Entrada"); q("meio").value=r.meio; if(r.parc>1) q("parc").value=r.parc; if(r.sugVal) q("val").placeholder=fmtNum(r.sugVal); }
}
function lRecorrentes(m){
  // o que foi lançado à mão no mês anterior e ainda não aparece neste mês
  const ja=new Set(state.manuais.filter(x=>recM(x)===m).map(x=>lNorm(x.desc))), vistos=new Set(), out=[];
  state.manuais.filter(x=>recM(x)===m-1 && !(x.parc>1)).sort((a,b)=>b.val-a.val).forEach(x=>{ const k=lNorm(x.desc); if(!k||ja.has(k)||vistos.has(k)) return; vistos.add(k); out.push(x); });
  return out.slice(0,8);
}
function lUsar(x){
  const t=new Date(), m=selMonth, dia=Math.min(+String(x.date).slice(8,10)||1, new Date(Math.floor(m/12),m%12+1,0).getDate());
  lDraft={date:isoD(monthIndex(t)===m? t : new Date(Math.floor(m/12),m%12,dia)), desc:x.desc, tipo:x.tipo||"Saída", cat:x.cat, sub:x.sub||"", meio:x.meio||"Pix", parc:1, val:x.val, conferir:true};
  rLanc(); const v=$("lTx").querySelector("tr.newrow [data-f=val]"); if(v){ v.focus(); v.select(); }
}
function lAjuda(){
  const el=$("lAjuda"); if(!el) return; const r=lDraft, ent=(r.tipo||"Saída")==="Entrada", m=selMonth;
  const tr=$("lTx").querySelector("tr.newrow"), vIn=tr&&tr.querySelector("[data-f=val]");
  const vTxt=vIn? vIn.value.trim() : "", vNum=vTxt? parseValue(vTxt,false) : NaN;
  let h="";
  const rec=lRecorrentes(m);
  if(rec.length && !r.desc) h+=`<div><b>Lançados em ${esc(fmtMLong(m-1))} e ainda não neste mês.</b> Toque para repetir:</div><div class="chips">${rec.map((x,i)=>`<button type="button" class="chip" data-rec="${i}">${esc(x.desc)}<span class="num">${BRL.format(x.val)}</span></button>`).join("")}</div>`;
  const passo=(ok,txt)=>`<span class="${ok?"ok":"falta"}">${ok?"✓":"○"} ${txt}</span>`;
  if(r.desc || vTxt){
    const valOk=vNum>0, valErr=vTxt && !(vNum>0);
    let cat="";
    if(r.cat) cat=`${esc(r.sub||r.cat)}${r.csTouched?"":" (automática)"}`;
    else if(!ent && r.desc){ const c=categorize(r.desc,"",cfg,state.regras); cat=`${esc(c.sub||c.cat)} <span class="muted">(${c.how==="regra"?"pelo que você ensinou":c.how==="palavra"?"pela palavra-chave":c.how==="palpite"?"palpite, confira":"não reconheci, escolha se quiser"})</span>`; }
    h+=`<div class="passos">${passo(!!r.desc,"Descrição")}${valErr?`<span class="erro">✕ Valor: escreva só números, ex.: 49,90</span>`:passo(valOk, valOk? "Valor "+BRL.format(vNum) : "Valor")}${cat?`<span>Categoria: <b>${cat}</b></span>`:(ent?`<span class="falta">○ Escolha a categoria da entrada</span>`:"")}</div>`;
    const dm=recM(r); if(dm!=null && dm!==m) h+=`<div class="falta">A data é de ${esc(fmtMLong(dm))}: o lançamento vai aparecer lá, não em ${esc(fmtMLong(m))}.</div>`;
    if(r.parc>1 && valOk) h+=`<div class="muted">${r.parc}x de ${BRL.format(vNum)} (o valor é de cada parcela).</div>`;
    if(r.sugVal && !vTxt) h+=`<div class="acoes"><span>Da última vez foi ${BRL.format(r.sugVal)}.</span><button type="button" class="primary" data-usarval>Lançar com ${BRL.format(r.sugVal)}</button></div>`;
    else if(r.conferir && r.desc && valOk) h+=`<div class="acoes"><span>Confira o valor e a data.</span><button type="button" class="primary" data-lancar>Lançar</button><button type="button" data-limpar>Limpar</button></div>`;
    else if(r.desc && !valOk) h+=`<div class="muted">Falta o valor. Ao preencher, a linha vira lançamento.</div>`;
  }
  if(!h) h=`<div class="muted">Escreva a descrição. Se você já lançou igual antes, eu completo tipo, categoria, meio de pagamento e sugiro o valor.</div>`;
  el.innerHTML=h;
  const box=$("lAjudaBox"); if(box && !box.dataset.ok){ box.dataset.ok=1; try{ if(localStorage.getItem("lf3-ajuda")==="0") box.open=false; }catch(e){}
    box.ontoggle=()=>{ try{ localStorage.setItem("lf3-ajuda", box.open?"1":"0"); }catch(e){} }; }
  el.querySelectorAll("[data-rec]").forEach(b=>b.onclick=()=>lUsar(rec[+b.dataset.rec]));
  const uv=el.querySelector("[data-usarval]"); if(uv) uv.onclick=()=>{ r.val=r.sugVal; delete r.sugVal; lCommit(); };
  const ln=el.querySelector("[data-lancar]"); if(ln) ln.onclick=()=>{ if(vNum>0) r.val=vNum; delete r.conferir; lCommit(); };
  const lp=el.querySelector("[data-limpar]"); if(lp) lp.onclick=()=>{ lDraft={date:r.date}; rLanc(); };
}
$("lCancel").onclick=resetForm;
$("lDel").onclick=()=>{ const id=editingId; const rec=state.manuais.find(x=>x.id===id); state.manuais=state.manuais.filter(x=>x.id!==id); resetForm(); save(); render();
  toast("Lançamento excluído.",[{label:"Desfazer",run:()=>{ state.manuais.push(rec); save(); render(); }}]); };
$("lForm").onsubmit=e=>{
  e.preventDefault(); const val=parseValue($("lVal").value,false);
  if(isNaN(val)||val<=0){ $("lMsg").textContent="Digite um valor maior que zero, por exemplo 49,90."; $("lVal").focus(); return; }
  const rec={id: editingId || "m:"+Date.now().toString(36)+Math.random().toString(36).slice(2,6), date:$("lDate").value, desc:$("lDesc").value.trim(),
    tipo:lTipo, cat:$("lCat").value, sub:$("lSub").value, meio:$("lMeio").value, val, parc:Math.max(1,parseInt($("lParc").value,10)||1), origem:"manual"};
  const old=state.manuais.find(x=>x.id===rec.id); if(old && old.origem==="planilha"){ rec.origem="planilha"; rec.alterado=true; }
  const i=state.manuais.findIndex(x=>x.id===rec.id); if(i>=0) state.manuais[i]=rec; else state.manuais.push(rec);
  if(state.seed) state.seed=false;
  let aprendeu=false; if(catTouched && rec.tipo==="Saída" && rec.desc){ const c=categorize(rec.desc,"",cfg,state.regras); if(c.cat!==rec.cat||(c.sub||"")!==(rec.sub||"")) aprendeu=!!learnRule(rec.desc,rec.cat,rec.sub); }
  if(aprendeu) toast(`Aprendido: próximas compras de “${esc(ruleKey(rec.desc))}” vão para <b>${esc(rec.sub||rec.cat)}</b>.`);
  $("lMsg").textContent=editingId?"Alteração salva.":`Lançado: ${rec.desc}, ${BRL.format(val)}.`; resetForm(); save(); render();
};

// ---------------- pasta ----------------
function rRules(){
  const R=state.regras;
  $("rSum").textContent=R.length? `${R.length} regra(s)` : "";
  $("rTx").innerHTML=R.map((r,ix)=>{ const t=targetOf(r.t); const n=ITEMS.filter(i=>i.kind==="cartao"&&i.how==="regra"&&i.rk===r.k).length;
    return `<tr><td data-l="Contém" class="full"><input data-rk="${ix}" value="${esc(String(r.k).toUpperCase())}" placeholder="ex.: DROGASIL" aria-label="Texto que a descrição contém"></td>
    <td data-l="Vai para" class="full"><select data-rt="${ix}" aria-label="Categoria e subcategoria">${catOptions(t.cat,t.sub)}</select></td>
    <td class="r num" data-l="Compras">${n}</td><td><button type="button" class="ghost" data-rdel="${ix}">Excluir</button></td></tr>`; }).join("")||`<tr><td colspan="4" class="empty">Nenhuma regra ainda. Corrija a categoria de uma compra na aba Cartões e ela aparece aqui.</td></tr>`;
  $("rTx").querySelectorAll("[data-rk]").forEach(inp=>inp.onchange=()=>{ const r=R[+inp.dataset.rk]; const v=inp.value.trim().toLowerCase(); if(v.length<2){ inp.value=String(r.k).toUpperCase(); $("rMsg").textContent="Use pelo menos 2 letras."; return; } r.k=v; save(); render(); });
  $("rTx").querySelectorAll("[data-rt]").forEach(sel=>sel.onchange=()=>{ const [c,sb]=sel.value.split("||"); R[+sel.dataset.rt].t=sb||c; save(); render(); });
  $("rTx").querySelectorAll("[data-rdel]").forEach(b=>b.onclick=()=>{ const ix=+b.dataset.rdel; const rec=R[ix]; state.regras.splice(ix,1); save(); render(); toast(`Regra “${esc(String(rec.k).toUpperCase())}” excluída.`,[{label:"Desfazer",run:()=>{ state.regras.splice(ix,0,rec); save(); render(); }}]); });
}
$("rAdd").onclick=()=>{ state.regras.unshift({k:"",t:"Outros (Gerais)",em:isoD(new Date())}); render(); const i=$("rTx").querySelector("[data-rk]"); if(i){ i.focus(); } $("rMsg").textContent="Digite o texto da descrição e escolha para onde vai."; };
$("rCopy").onclick=async()=>{ const txt=state.regras.filter(r=>r.k).map(r=>String(r.k).toUpperCase()+"\t"+r.t).join("\n"); if(!txt){ $("rMsg").textContent="Ainda não há regras."; return; }
  try{ await navigator.clipboard.writeText(txt); $("rMsg").textContent="Copiado. Na planilha, cole nas colunas de palavra-chave e subcategoria da aba Cadastros."; }catch(e){ $("out").hidden=false; $("out").value=txt; $("out").select(); $("rMsg").textContent="Selecionei o texto no quadro “Levar para a planilha”: use Ctrl+C."; } };
function rPasta(){
  $("bJson").hidden=inFrame;
  const nF=INFO.filter(x=>!x.erro).length, nI=ITEMS.filter(i=>i.kind==="cartao").length, nM=state.manuais.length;
  $("fSummary").textContent=`${nF} fatura(s) · ${nI} compras · ${nM} lançamentos manuais · ${cfg.cats.length} categorias · ${cfg.subs.length} subcategorias`;
  $("fList").innerHTML=INFO.map(x=>{
    if(x.erro) return `<div class="file"><b>${esc(x.nome)}</b><span class="tag out">não lido</span><span class="how">${esc(x.erro)}</span></div>`;
    const L=x.p.layouts[0]; const bank=L?(L.bank?L.bank.name:"Banco novo"):"?";
    const how=x.p.layouts.map(L=>`${L.bank?L.bank.name:"Banco novo"}${L.fromTemplate?" (sem cabeçalho, pelo modelo)":""}: data na coluna ${L.date+1}, descrição ${L.desc+1}, valor ${L.val+1}${L.parc>=0?`, parcela ${L.parc+1}`:""}${L.fin>=0?`, final ${L.fin+1}`:""}`).join(" · ");
    return `<div class="file"><b>${esc(x.nome)}</b><span class="tag ${x.p.items.length?"in":"out"}">${x.origem==="pdf"?"PDF · ":""}${x.p.items.length} linhas</span><span class="how">${esc(how||"Não achei data e valor.")}${x.p.warnings?` · ${x.p.warnings} linha(s) não reconhecida(s)`:""} <button type="button" class="ghost" data-rm="${esc(x.nome)}">Remover</button></span></div>`;
  }).join("")||`<div class="empty">Nenhuma fatura ainda. Conecte a pasta ou escolha os arquivos.</div>`;
  $("fList").querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{ state.arquivos=state.arquivos.filter(a=>a.nome!==b.dataset.rm); save(); render(); });
  if(!dirHandle && !$("saveStatus").textContent) $("saveStatus").textContent = FS_OK? "Os dados ficam neste navegador até você conectar a pasta." : (inFrame? "Aqui os dados ficam neste navegador. Para gravar o JSON na pasta, abra o leitor-faturas.html no Chrome ou Edge." : "Este navegador não conecta pastas: use Salvar JSON para guardar o arquivo.");
}
$("fFiles").onchange=e=>{ addFiles(e.target.files); e.target.value=""; };
$("fJson").onchange=e=>{ const f=e.target.files[0]; if(f) openJson(f); e.target.value=""; };
$("bJson").onclick=async()=>{
  const data=JSON.stringify(state,null,1);
  if(dirHandle){ save(); toast("JSON gravado na pasta."); return; }
  if(typeof window.showSaveFilePicker==="function"){ try{ const h=await window.showSaveFilePicker({suggestedName:JSON_NAME}); const w=await h.createWritable(); await w.write(data); await w.close(); toast("JSON salvo."); return; }catch(e){ if(e.name==="AbortError") return; } }
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([data],{type:"application/json"})); a.download=JSON_NAME; a.click();
};
function fmtNum(v){ return (Math.round(v*100)/100).toFixed(2).replace(".",","); }
function cellOut(c){ if(typeof c==="number"){ if(c>20000&&c<80000&&Number.isInteger(c)) return fmtD(serialToDate(c)); return String(c).replace(".",","); } return String(c??"").replace(/;/g,","); }
async function copy(text,msg){ const st=$("copyStatus"), ta=$("out");
  try{ await navigator.clipboard.writeText(text); st.textContent=msg; st.style.color="var(--in)"; ta.hidden=true; }
  catch(e){ ta.hidden=false; ta.value=text; ta.focus(); ta.select(); st.textContent="Não consegui copiar sozinho. O texto está selecionado abaixo: use Ctrl+C."; st.style.color="var(--out)"; } }
$("bCopyPlan").onclick=()=>{ const out=[]; state.arquivos.forEach(f=>{ if(f.erro) return; if(!f.colMode&&f.text) out.push(...f.text.replace(/\r/g,"").split("\n").filter(l=>l.trim())); else (f.rows||[]).forEach(r=>{ if(r.some(c=>String(c??"").trim())) out.push(r.map(cellOut).join(";")); }); });
  copy(out.join("\n"),"Copiado. Na planilha, clique na primeira linha vazia da aba Faturas (a partir de A6) e cole."); };
$("bCopyTable").onclick=()=>{ const head=["Data","Tipo","Onde / como","Descrição","Parcela","Valor","Categoria","Subcategoria","Mês","Até"];
  copy([head.join("\t")].concat(ITEMS.filter(i=>!i.ign).map(i=>[fmtD(i.date),isOut(i)?"Saída":"Entrada",i.kind==="cartao"?cardName(i.cardKey):i.meio,i.desc,i.N>1?i.n+"/"+i.N:"",fmtNum(i.val),i.cat,i.sub||"",fmtM(i.m),i.mEnd>i.m?fmtM(i.mEnd):""].join("\t"))).join("\n"),"Tabela copiada. Cole no Excel ou onde quiser."); };

// drag & drop anywhere
["dragenter","dragover"].forEach(t=>document.addEventListener(t,e=>e.preventDefault()));
document.addEventListener("drop",e=>{ e.preventDefault(); if(e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

// ---------------- start ----------------
(async()=>{
  const h=location.hash.slice(1); if(["resumo","cartoes","analise","lancamentos","pasta","dados"].includes(h)) tab= h==="pasta"?"dados":h;
  const ls=lsGet(); state= ls&&ls.versao>=3 ? Object.assign(blank(),ls) : seedState(); applyCfg();
  render();
  if(FS_OK){ const saved=await idbGet("dir");
    if(saved){ try{ const p=await saved.queryPermission({mode:"readwrite"}); savedName=saved.name||""; if(p==="granted") await useDir(saved); else { updateCover(); $("bDir").textContent="Reconectar pasta"; setFolder("Pasta "+saved.name+" · clique para reconectar","info"); } }catch(e){} } }
  else if(inFrame) setFolder("Dados só neste navegador");
})();
