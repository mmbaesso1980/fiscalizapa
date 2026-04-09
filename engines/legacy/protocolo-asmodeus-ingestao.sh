#!/bin/bash
# ================================================================
# 🔥 PROTOCOLO A.S.M.O.D.E.U.S. — INGESTÃO (V5 - FINAL CORRIGIDA)
# ================================================================

PROJECT_ID=$(gcloud config get-value project)
DS="fiscalizapa"
TMPDIR="./asmodeus_temp"
mkdir -p "$TMPDIR"

echo "🔥 INGESTÃO MASSIVA DE DADOS"
echo "   Destino: $PROJECT_ID:$DS"

# --- FUNÇÃO IBGE (Com Autodetect de Schema) ---
ingerir_ibge() {
  echo "🗺️ Baixando municípios do IBGE..."
  python3 << PYEOF
import json, csv, urllib.request, sys, gzip, os
url = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
req = urllib.request.Request(url, headers={'Accept-Encoding': 'gzip'})
try:
    resp = urllib.request.urlopen(req, timeout=60)
    raw_data = resp.read()
    if raw_data.startswith(b'\x1f\x8b'): raw_data = gzip.decompress(raw_data)
    municipios = json.loads(raw_data.decode('utf-8'))
    campos = ["id_municipio","nome","uf","regiao"]
    with open("asmodeus_temp/ibge_municipios.csv", "w", newline="", encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=campos)
        writer.writeheader()
        for m in municipios:
            micro = m.get("microrregiao") or {}
            meso = micro.get("mesorregiao") or {}
            uf_data = meso.get("UF") or {}
            regiao_data = uf_data.get("regiao") or {}
            writer.writerow({
                "id_municipio": str(m.get("id", "")),
                "nome": m.get("nome", ""),
                "uf": uf_data.get("sigla", ""),
                "regiao": regiao_data.get("nome", "")
            })
    print("✅ CSV do IBGE gerado.")
except Exception as e:
    print(f"❌ Erro: {e}", file=sys.stderr); sys.exit(1)
PYEOF

  if [ $? -eq 0 ]; then
    # O segredo: adicionamos --autodetect para o BigQuery entender as colunas sozinho
    bq load --autodetect --source_format=CSV --skip_leading_rows=1 --replace \
      "$DS.ibge_municipios" "$TMPDIR/ibge_municipios.csv" && echo "🔥 IBGE no BigQuery!"
  fi
}

# --- FUNÇÃO QUERIDO DIÁRIO (Com fix de acentos/URL) ---
ingerir_querido_diario() {
  MUN_ID=${1:-"1501402"}
  TERMOS=${2:-"dispensa de licitação,emergência"}
  echo "📰 Buscando Diários Oficiais..."
  python3 << PYEOF
import json, csv, urllib.request, sys, os, urllib.parse
campos = ["id_diario","id_municipio","municipio","uf","data_publicacao","url","excerto","termo_busca"]
with open("asmodeus_temp/diarios.csv", "w", newline="", encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=campos)
    writer.writeheader()
    for termo in "$TERMOS".split(","):
        # Corrigindo os acentos para a URL (quote)
        termo_encoded = urllib.parse.quote(termo.strip())
        url = f"https://queridodiario.ok.org.br/api/gazettes?territory_ids=$MUN_ID&querystring={termo_encoded}&size=50"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            data = json.loads(urllib.request.urlopen(req).read())
            for g in data.get("gazettes", []):
                writer.writerow({
                    "id_diario": g.get("territory_id","") + "_" + g.get("date",""),
                    "id_municipio": g.get("territory_id",""),
                    "municipio": g.get("territory_name",""),
                    "data_publicacao": g.get("date",""),
                    "url": g.get("url",""),
                    "excerto": (g.get("excerpts",[""])[0])[:500],
                    "termo_busca": termo
                })
        except Exception as e: continue
PYEOF
  # Adicionado --autodetect aqui também
  bq load --autodetect --source_format=CSV --skip_leading_rows=1 --replace \
    "$DS.diarios_oficiais" "$TMPDIR/diarios.csv" && echo "🔥 Diários no BigQuery!"
}

echo "✅ Protocolo A.S.M.O.D.E.U.S. V5 carregado."