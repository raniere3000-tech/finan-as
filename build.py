#!/usr/bin/env python3
"""Monta o Leitor de Faturas num único HTML.

Uso:
  python3 build.py                                  # gera index.html com data/defaults.json (sem dados pessoais)
  python3 build.py --data private/dados.json --out private/leitor.html   # versão pessoal (não vai para o git)

O arquivo de dados é um JSON com:
  cfg   -> {cats:[{nome,tipo,grupo}], subs:[[sub,cat]], kw:[[palavra,sub]]}
  cards -> {"Banco|final": {fech:dia, venc:dia}}   (opcional)
  seed  -> {arquivos:[...], manuais:[...]}          (opcional: dados de exemplo)
"""
import argparse, json, os

ROOT = os.path.dirname(os.path.abspath(__file__))

def build(data_path, out_path):
    rd = lambda p: open(os.path.join(ROOT, p), encoding="utf-8").read()
    tpl, app, pdf = rd("src/template.html"), rd("src/app.js"), rd("src/pdf-lines.js")
    data = json.load(open(data_path, encoding="utf-8"))
    data.setdefault("cards", {}); data.setdefault("seed", {"arquivos": [], "manuais": []})
    emb = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    pdf = pdf[pdf.index("/*PDF-START*/"):pdf.index("/*PDF-END*/") + len("/*PDF-END*/")]
    out = tpl.replace("__EMB__", emb).replace("/*PDF-PLACEHOLDER*/", pdf).replace("/*APP-PLACEHOLDER*/", app)
    # caracteres invisíveis viram escapes para o arquivo ficar limpo
    for ch, esc in (("�", "\\uFFFD"), ("﻿", "\\ufeff"), ("­", "\\u00ad"), (" ", "\\u00a0")):
        out = out.replace(ch, esc)
    i = out.index("<style>"); head, rest = out[:i], out[i:]; j = rest.index("</style>") + len("</style>")
    full = ("<!doctype html>\n<html lang=\"pt-BR\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
            "<meta name=\"description\" content=\"Leitor de faturas de cartão de crédito que roda no navegador: lê CSV, Excel e PDF de uma pasta do seu computador e salva tudo nela.\">\n"
            + head + rest[:j] + "\n</head>\n<body>\n" + rest[j:] + "\n</body>\n</html>\n")
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    open(out_path, "w", encoding="utf-8").write(full)
    print(f"{out_path}: {len(full.encode('utf-8'))} bytes")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(ROOT, "data", "defaults.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "index.html"))
    a = ap.parse_args()
    build(a.data, a.out)
