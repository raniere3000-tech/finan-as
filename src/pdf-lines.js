/*PDF-START*/
// Group pdf.js text items into visual lines (top to bottom, left to right)
function pdfItemsToLines(items){
  const rows=[];
  for(const it of items){
    if(!it.str || !it.str.trim()) continue;
    const x=it.transform[4], y=it.transform[5], w=it.width||0;
    let row=rows.find(r=>Math.abs(r.y-y)<2.5);
    if(!row){ row={y, parts:[]}; rows.push(row); }
    row.parts.push({x, w, s:it.str});
  }
  rows.sort((a,b)=>b.y-a.y);
  return rows.map(r=>{
    r.parts.sort((a,b)=>a.x-b.x);
    let out="", end=null;
    for(const p of r.parts){
      if(end!==null) out += (p.x-end>6) ? "   " : (p.x-end>0.5 ? " " : "");
      out+=p.s; end=p.x+p.w;
    }
    return out.replace(/\s+$/,"");
  });
}
const PDF_BANKS=[[/mercado\s*pago/i,"Mercado Pago"],[/nubank|nu pagamentos/i,"Nubank"],[/\bc6\s*bank\b|banco c6/i,"C6"],
  [/ita[uú]/i,"Itaú"],[/bradesco/i,"Bradesco"],[/santander/i,"Santander"],[/banco inter\b|\binter&co/i,"Inter"],
  [/picpay/i,"PicPay"],[/caixa econ/i,"Caixa"],[/banco do brasil|ourocard/i,"Banco do Brasil"],[/\bwill bank\b/i,"Will Bank"],[/neon/i,"Neon"]];
// Turn the lines of a card statement PDF into a ';' CSV the reader (and the planilha) understands
function pdfLinesToCsv(lines){
  const all=lines.join("\n");
  let bank="Banco novo"; for(const [re,n] of PDF_BANKS){ if(re.test(all)){ bank=n; break; } }
  let ref=null;
  let m=all.match(/venc(?:imento|e em)[^\d\n]{0,25}(\d{2})\/(\d{2})\/(\d{4})/i) || all.match(/emitida em[^\d\n]{0,10}(\d{2})\/(\d{2})\/(\d{4})/i);
  if(m) ref=new Date(+m[3],+m[2]-1,+m[1]);
  if(!ref){ let best=null; for(const d of all.matchAll(/(\d{2})\/(\d{2})\/(20\d{2})/g)){ const dt=new Date(+d[3],+d[2]-1,+d[1]); if(!best||dt>best) best=dt; } ref=best||new Date(); }
  const out=[]; let fin="";
  const RX=/^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\s+(.+?)\s+(?:parcela\s+(\d+)\s*(?:de|\/)\s*(\d+)\s+)?([-+]?\s*R\$\s*[-+]?\s*[\d.]+,\d{2}|[-+]?\s*[\d.]+,\d{2})\s*(-)?$/i;
  for(const raw of lines){
    const line=raw.trim();
    const c=line.match(/cart[aã]o[^\n]*?\[\s*[*•xX.\s\d]*?(\d{4})\s*\]/i) || line.match(/final\s*(?:do cart[aã]o)?\s*[:\-]?\s*(\d{4})\b/i);
    if(c && !RX.test(line)){ fin=c[1]; continue; }
    const t=line.match(RX); if(!t) continue;
    let desc=t[4].trim();
    if(/^total\b|^subtotal|^saldo/i.test(desc)) continue;
    if(!/[A-Za-zÀ-ÿ]{2}/.test(desc) || /^R\$/i.test(desc)) continue;
    let pm=desc.match(/\s+parcela\s+(\d+)\s*(?:de|\/)\s*(\d+)$/i); let n=t[5], N=t[6];
    if(pm){ n=pm[1]; N=pm[2]; desc=desc.slice(0,pm.index).trim(); }
    const dd=+t[1], mm=+t[2]; let y=t[3]? +t[3] : ref.getFullYear(); if(y<100) y+=2000;
    if(!t[3] && mm>ref.getMonth()+1) y-=1;
    let vtxt=t[7].replace(/R\$/i,"").replace(/\s/g,""); let neg=vtxt.includes("-")||!!t[8];
    vtxt=vtxt.replace(/[-+]/g,"");
    if(/pagamento|pagto\.?\s|pgto/i.test(desc)) neg=true;
    const val=(neg?"-":"")+vtxt;
    out.push([String(dd).padStart(2,"0")+"/"+String(mm).padStart(2,"0")+"/"+y, desc.replace(/;/g,","), n?`${n} de ${N}`:"", val, fin, bank].join(";"));
  }
  const head = bank==="Mercado Pago" ? "Data;Movimentações;Parcela;Valor em R$;Final do cartão;Banco" : "Data;Descrição;Parcela;Valor;Final do cartão;Banco";
  return {bank, ref, count:out.length, text: out.length? head+"\n"+out.join("\n") : ""};
}
/*PDF-END*/
if(typeof module!=="undefined") module.exports={pdfItemsToLines,pdfLinesToCsv};
