#!/bin/bash
# ================================================================
# 🔥 PROTOCOLO A.S.M.O.D.E.U.S. — SETUP COMPLETO
# Analytical System for Monitoring Official Data & Exposing
# Unethical Schemes
#
# PARTE 1: Criação de TODAS as tabelas necessárias
# PARTE 2: Views forenses do usuário (Módulos 1-6)
# PARTE 3: Scripts de ingestão de dados reais
# ================================================================

set -e
PROJECT_ID=$(gcloud config get-value project)
DS="fiscalizapa"

echo "🔥 =============================================="
echo "   PROTOCOLO A.S.M.O.D.E.U.S. — SETUP"
echo "   Projeto: $PROJECT_ID"
echo "   Dataset: $DS"
echo "🔥 =============================================="

# ==========================================
# PARTE 1: TABELAS QUE FALTAM
# ==========================================
echo ""
echo "📦 CRIANDO TABELAS DE INTELIGÊNCIA..."
echo ""

# --- CONTRATOS E LICITAÇÕES ---
echo "  [1/25] contratos..."
bq mk --table $DS.contratos \
  id_contrato:STRING,municipio:STRING,uf_contratante:STRING,id_ibge:STRING,\
  modalidade:STRING,objeto_contrato:STRING,objeto_resumido:STRING,\
  cnpj_vencedor:STRING,nome_vencedor:STRING,valor:FLOAT,\
  data_assinatura:STRING,data_vigencia_fim:STRING,\
  orgao:STRING,fonte_recurso:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

echo "  [2/25] licitacoes..."
bq mk --table $DS.licitacoes \
  id_licitacao:STRING,municipio:STRING,uf:STRING,id_ibge:STRING,\
  modalidade:STRING,objeto:STRING,valor_estimado:FLOAT,\
  cnpj_vencedor:STRING,valor_vencedor:FLOAT,\
  data_abertura:STRING,data_homologacao:STRING,\
  situacao:STRING,orgao:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

echo "  [3/25] licitacoes_participantes..."
bq mk --table $DS.licitacoes_participantes \
  id_licitacao:STRING,cnpj:STRING,razaoSocial:STRING,\
  valor_proposta:FLOAT,vencedor:BOOLEAN,municipio:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

echo "  [4/25] itens_contratos..."
bq mk --table $DS.itens_contratos \
  id_contrato:STRING,municipio:STRING,descricao_item:STRING,\
  unidade:STRING,quantidade:FLOAT,valor_unitario:FLOAT,valor_total:FLOAT,\
  codigo_br_medicamento:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- CNPJ E SÓCIOS ---
echo "  [5/25] cnpj_socios..."
bq mk --table $DS.cnpj_socios \
  cnpj:STRING,nome_socio:STRING,cpf_socio:STRING,\
  qualificacao:STRING,data_entrada:STRING,faixa_etaria:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- SICAF/CEIS ---
echo "  [6/25] sicaf_punicoes..."
bq mk --table $DS.sicaf_punicoes \
  cnpj:STRING,razaoSocial:STRING,tipo_punicao:STRING,\
  motivo_punicao:STRING,orgao_sancionador:STRING,\
  data_inicio_punicao:STRING,data_fim_punicao:STRING,\
  fundamentoLegal:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- IBGE ---
echo "  [7/25] ibge_municipios..."
bq mk --table $DS.ibge_municipios \
  id_municipio:STRING,nome:STRING,uf:STRING,regiao:STRING,\
  populacao:INTEGER,area_km2:FLOAT,densidade:FLOAT,\
  pib:FLOAT,pib_per_capita:FLOAT 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

echo "  [8/25] ibge_indicadores..."
bq mk --table $DS.ibge_indicadores \
  id_municipio:STRING,nome:STRING,uf:STRING,\
  idh_anterior:FLOAT,idh_atual:FLOAT,\
  idhm_renda:FLOAT,idhm_educacao:FLOAT,idhm_longevidade:FLOAT,\
  taxa_analfabetismo:FLOAT,esperanca_vida:FLOAT,\
  pct_extrema_pobreza:FLOAT,gini:FLOAT,\
  pct_sem_esgoto:FLOAT,pct_agua_tratada:FLOAT,\
  pct_coleta_lixo:FLOAT 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- TSE / ELEIÇÕES ---
echo "  [9/25] tse_doacoes..."
bq mk --table $DS.tse_doacoes \
  ano_eleicao:INTEGER,turno:STRING,\
  candidato_apoiado:STRING,cpf_candidato:STRING,cargo_candidato:STRING,\
  municipio:STRING,uf:STRING,sigla_partido:STRING,\
  nome_doador:STRING,cpf_cnpj_doador:STRING,tipo_doador:STRING,\
  valor_doado:FLOAT,data_doacao:STRING,\
  fonte_recurso:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

echo "  [10/25] tse_candidatos..."
bq mk --table $DS.tse_candidatos \
  ano_eleicao:INTEGER,cpf:STRING,nome:STRING,\
  cargo:STRING,municipio:STRING,uf:STRING,\
  sigla_partido:STRING,situacao:STRING,\
  total_votos:INTEGER,eleito:BOOLEAN,\
  patrimonio_declarado:FLOAT,grau_instrucao:STRING,\
  ocupacao:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

echo "  [11/25] prefeitos_eleitos..."
bq mk --table $DS.prefeitos_eleitos \
  municipio:STRING,uf:STRING,id_ibge:STRING,\
  nome_prefeito:STRING,cpf:STRING,sigla_partido:STRING,\
  ano_eleicao:INTEGER,total_votos:INTEGER,\
  vice_prefeito:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- SAÚDE / DATASUS ---
echo "  [12/25] sus_producao_ambulatorial..."
bq mk --table $DS.sus_producao_ambulatorial \
  id_municipio:STRING,municipio:STRING,uf:STRING,\
  ano_competencia:INTEGER,mes_competencia:INTEGER,\
  grupo_procedimento:STRING,subgrupo:STRING,\
  quantidade:INTEGER,valor_total:FLOAT 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

echo "  [13/25] sus_leitos..."
bq mk --table $DS.sus_leitos \
  id_municipio:STRING,municipio:STRING,uf:STRING,\
  total_leitos:INTEGER,leitos_sus:INTEGER,\
  leitos_uti:INTEGER,leitos_uti_sus:INTEGER 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

echo "  [14/25] sus_mortalidade..."
bq mk --table $DS.sus_mortalidade \
  id_municipio:STRING,municipio:STRING,uf:STRING,ano:INTEGER,\
  obitos_totais:INTEGER,obitos_infantis:INTEGER,\
  nascidos_vivos:INTEGER,taxa_mortalidade_infantil:FLOAT 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- EMENDAS DETALHADAS ---
echo "  [15/25] emendas_pagas..."
bq mk --table $DS.emendas_pagas \
  codigo_emenda:STRING,ano:INTEGER,autor_emenda:STRING,\
  tipo_emenda:STRING,area_atuacao:STRING,\
  municipio:STRING,uf:STRING,id_ibge:STRING,\
  objeto_emenda:STRING,\
  valor_empenhado:FLOAT,valor_liquidado:FLOAT,valor_pago:FLOAT,\
  beneficiario:STRING,cnpj_beneficiario:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- FOLHA DE PAGAMENTO MUNICIPAL ---
echo "  [16/25] folha_pagamento..."
bq mk --table $DS.folha_pagamento \
  cpf:STRING,nome_servidor:STRING,cargo:STRING,\
  orgao:STRING,municipio:STRING,uf:STRING,\
  carga_horaria:INTEGER,\
  salario_bruto:FLOAT,salario_liquido:FLOAT,\
  mes_referencia:STRING,vinculo:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- ÓBITOS (para detectar pagamento a mortos) ---
echo "  [17/25] obitos_sisobi..."
bq mk --table $DS.obitos_sisobi \
  cpf:STRING,nome:STRING,data_obito:STRING,\
  municipio_obito:STRING,uf:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- BANCO DE PREÇOS ---
echo "  [18/25] banco_precos_saude..."
bq mk --table $DS.banco_precos_saude \
  codigo_br:STRING,descricao:STRING,unidade:STRING,\
  preco_mediano_bancodeprecos:FLOAT,\
  preco_minimo:FLOAT,preco_maximo:FLOAT,\
  data_referencia:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- PROGRAMAS SOCIAIS ---
echo "  [19/25] bpc_beneficiarios..."
bq mk --table $DS.bpc_beneficiarios \
  cpf:STRING,nis:STRING,nome:STRING,\
  municipio:STRING,uf:STRING,\
  tipo_beneficio:STRING,valor:FLOAT,\
  mes_referencia:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

echo "  [20/25] seguro_defeso..."
bq mk --table $DS.seguro_defeso \
  cpf:STRING,nis:STRING,nome:STRING,\
  municipio:STRING,uf:STRING,\
  valor:FLOAT,mes_referencia:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- QUERIDO DIÁRIO ---
echo "  [21/25] diarios_oficiais..."
bq mk --table $DS.diarios_oficiais \
  id_diario:STRING,id_municipio:STRING,municipio:STRING,uf:STRING,\
  data_publicacao:STRING,url:STRING,\
  excerto:STRING,\
  termo_busca:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- TCE (DADOS CONSOLIDADOS) ---
echo "  [22/25] tce_despesas_municipais..."
bq mk --table $DS.tce_despesas_municipais \
  id_municipio:STRING,municipio:STRING,uf:STRING,\
  ano:INTEGER,mes:INTEGER,\
  funcao:STRING,subfuncao:STRING,\
  elemento_despesa:STRING,modalidade:STRING,\
  valor_empenhado:FLOAT,valor_liquidado:FLOAT,valor_pago:FLOAT,\
  credor_cnpj:STRING,credor_nome:STRING,\
  fonte:STRING 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

echo "  [23/25] tce_receitas_municipais..."
bq mk --table $DS.tce_receitas_municipais \
  id_municipio:STRING,municipio:STRING,uf:STRING,\
  ano:INTEGER,mes:INTEGER,\
  fonte_receita:STRING,categoria:STRING,\
  valor_previsto:FLOAT,valor_arrecadado:FLOAT 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- PROCESSOS JUDICIAIS ---
echo "  [24/25] processos_judiciais..."
bq mk --table $DS.processos_judiciais \
  cpf_cnpj:STRING,nome:STRING,\
  tribunal:STRING,numero_processo:STRING,\
  classe:STRING,assunto:STRING,\
  data_distribuicao:STRING,situacao:STRING,\
  polo:STRING,\
  valor_causa:FLOAT 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

# --- PATRIMÔNIO DECLARADO (TSE) ---
echo "  [25/25] patrimonio_declarado..."
bq mk --table $DS.patrimonio_declarado \
  cpf:STRING,nome:STRING,ano_eleicao:INTEGER,\
  tipo_bem:STRING,descricao_bem:STRING,\
  valor_bem:FLOAT 2>/dev/null && echo "    ✅" || echo "    ⚠️ já existe"

echo ""
echo "📦 TABELAS CRIADAS! Total esperado:"
bq ls $DS | grep -c "TABLE"
echo ""

# ==========================================
# PARTE 2: VIEWS FORENSES DO USUÁRIO
# (Módulos 1-6 do script ASMODEUS)
# ==========================================
echo "🔥 CRIANDO VIEWS FORENSES — MÓDULOS 1-6..."
echo ""

# --- MÓDULO 1: EMPRESAS DE FACHADA ---
echo "  📂 MÓDULO 1: Empresas de Fachada e Incompatibilidade"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_cnae_incompativel AS
SELECT c.id_contrato,c.municipio,c.objeto_contrato,c.valor,
f.cnpj,f.razaoSocial,f.cnaeDescricao AS cnae_principal_descricao,
"🔴 OBJETO INCOMPATÍVEL COM CNAE" AS alerta
FROM '"$DS"'.contratos c
JOIN '"$DS"'.cnpj_enriquecido f ON REPLACE(REPLACE(c.cnpj_vencedor,".",""),"/","")=REPLACE(REPLACE(f.cnpj,".",""),"/","")
WHERE (UPPER(c.objeto_contrato) LIKE "%MEDICAMENTO%" AND UPPER(f.cnaeDescricao) NOT LIKE "%FARMAC%" AND UPPER(f.cnaeDescricao) NOT LIKE "%MEDIC%")
OR (UPPER(c.objeto_contrato) LIKE "%MERENDA%" AND UPPER(f.cnaeDescricao) NOT LIKE "%ALIMENT%" AND UPPER(f.cnaeDescricao) NOT LIKE "%REFEI%")
OR (UPPER(c.objeto_contrato) LIKE "%ASFALTO%" AND UPPER(f.cnaeDescricao) NOT LIKE "%CONSTRU%" AND UPPER(f.cnaeDescricao) NOT LIKE "%ENGENH%")
OR (UPPER(c.objeto_contrato) LIKE "%SHOW%" AND UPPER(f.cnaeDescricao) NOT LIKE "%ESPETAC%" AND UPPER(f.cnaeDescricao) NOT LIKE "%EVENT%")
OR (UPPER(c.objeto_contrato) LIKE "%TRANSPORTE%" AND UPPER(f.cnaeDescricao) NOT LIKE "%TRANSPORT%" AND UPPER(f.cnaeDescricao) NOT LIKE "%LOGIST%")
ORDER BY c.valor DESC
' && echo "    ✅ View 36 — CNAE Incompatível"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_empresa_recem_nascida AS
SELECT l.id_licitacao,l.municipio,l.data_homologacao,
f.cnpj,f.razaoSocial,f.dataAbertura AS data_abertura,
DATE_DIFF(SAFE.PARSE_DATE("%Y-%m-%d",l.data_homologacao),SAFE.PARSE_DATE("%Y-%m-%d",f.dataAbertura),DAY) AS dias_de_vida,
l.valor_vencedor,
"🔴 EMPRESA <90 DIAS GANHOU LICITAÇÃO" AS alerta
FROM '"$DS"'.licitacoes l
JOIN '"$DS"'.cnpj_enriquecido f ON REPLACE(REPLACE(l.cnpj_vencedor,".",""),"/","")=REPLACE(REPLACE(f.cnpj,".",""),"/","")
WHERE DATE_DIFF(SAFE.PARSE_DATE("%Y-%m-%d",l.data_homologacao),SAFE.PARSE_DATE("%Y-%m-%d",f.dataAbertura),DAY)<=90
ORDER BY l.valor_vencedor DESC
' && echo "    ✅ View 37 — Empresa Recém-Nascida"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_fracionamento_despesas AS
SELECT cnpj_vencedor,municipio,
COUNT(id_contrato) AS qtd_dispensas,
ROUND(SUM(valor),2) AS valor_total,
"🔴 FRACIONAMENTO PARA FUGIR DE LICITAÇÃO" AS alerta
FROM '"$DS"'.contratos
WHERE modalidade="DISPENSA"
GROUP BY 1,2
HAVING qtd_dispensas>=3 AND valor_total>50000
ORDER BY valor_total DESC
' && echo "    ✅ View 38 — Fracionamento de Despesas"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_fornecedor_punido AS
SELECT c.id_contrato,c.municipio,c.data_assinatura,c.valor,
s.cnpj,s.motivo_punicao,s.data_fim_punicao,
"🔴 CONTRATO COM EMPRESA SUSPENSA/INIDÔNEA" AS alerta
FROM '"$DS"'.contratos c
JOIN '"$DS"'.sicaf_punicoes s ON REPLACE(REPLACE(c.cnpj_vencedor,".",""),"/","")=REPLACE(REPLACE(s.cnpj,".",""),"/","")
WHERE SAFE.PARSE_DATE("%Y-%m-%d",c.data_assinatura) BETWEEN SAFE.PARSE_DATE("%Y-%m-%d",s.data_inicio_punicao) AND SAFE.PARSE_DATE("%Y-%m-%d",s.data_fim_punicao)
ORDER BY c.valor DESC
' && echo "    ✅ View 39 — Fornecedor Punido SICAF/CEIS"

# --- MÓDULO 2: PÃO E CIRCO ---
echo ""
echo "  📂 MÓDULO 2: Pão e Circo / Impacto Social"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_pao_e_circo_arenas AS
SELECT c.municipio,c.objeto_contrato,c.valor AS custo_evento,
i.populacao,ROUND(c.valor/i.populacao,2) AS custo_per_capita,
i2.pct_sem_esgoto,i2.idh_atual AS idhm,
"🔴 SHOW CUSTANDO >R$50/HABITANTE" AS alerta
FROM '"$DS"'.contratos c
JOIN '"$DS"'.ibge_municipios i ON c.id_ibge=i.id_municipio
LEFT JOIN '"$DS"'.ibge_indicadores i2 ON c.id_ibge=i2.id_municipio
WHERE (UPPER(c.objeto_contrato) LIKE "%SHOW%" OR UPPER(c.objeto_contrato) LIKE "%FESTIV%" OR UPPER(c.objeto_contrato) LIKE "%ARENA%" OR UPPER(c.objeto_contrato) LIKE "%ARTISTA%" OR UPPER(c.objeto_contrato) LIKE "%MUSICAL%")
AND (c.valor/NULLIF(i.populacao,0))>50
ORDER BY custo_per_capita DESC
' && echo "    ✅ View 40 — Pão e Circo"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_gastos_vs_idh_decrescente AS
SELECT c.municipio,ROUND(SUM(c.valor),2) AS total_gasto_infra,
i.idh_anterior,i.idh_atual,
ROUND(i.idh_atual-i.idh_anterior,4) AS variacao_idh,
"🔴 OBRAS MILIONÁRIAS MAS IDH CAIU" AS alerta
FROM '"$DS"'.contratos c
JOIN '"$DS"'.ibge_indicadores i ON c.id_ibge=i.id_municipio
WHERE UPPER(c.objeto_contrato) LIKE "%CONSTRU%" OR UPPER(c.objeto_contrato) LIKE "%OBRA%" OR UPPER(c.objeto_contrato) LIKE "%REFORM%"
GROUP BY c.municipio,i.idh_anterior,i.idh_atual
HAVING SUM(c.valor)>10000000 AND i.idh_atual<i.idh_anterior
ORDER BY total_gasto_infra DESC
' && echo "    ✅ View 41 — Obras com IDH em Queda"

# --- MÓDULO 3: SAÚDE FANTASMA ---
echo ""
echo "  📂 MÓDULO 3: Saúde Fantasma / DataSUS"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_saude_fantasma AS
SELECT e.municipio,e.autor_emenda,e.valor_pago AS valor_emenda_saude,
e.objeto_emenda,
COALESCE(s.qtd_procedimentos,0) AS procedimentos_sus,
CASE
  WHEN COALESCE(s.qtd_procedimentos,0)<100 AND e.valor_pago>1000000 THEN "🔴 EMENDA MILIONÁRIA SEM REFLEXO NO SUS"
  WHEN COALESCE(s.qtd_procedimentos,0)<500 AND e.valor_pago>500000 THEN "🟠 BAIXO IMPACTO NO SUS"
  ELSE "🟡 VERIFICAR"
END AS alerta
FROM '"$DS"'.emendas_pagas e
LEFT JOIN (SELECT id_municipio,SUM(quantidade) AS qtd_procedimentos FROM '"$DS"'.sus_producao_ambulatorial GROUP BY 1) s ON e.id_ibge=s.id_municipio
WHERE UPPER(e.area_atuacao)="SAÚDE" AND e.valor_pago>500000
ORDER BY e.valor_pago DESC
' && echo "    ✅ View 42 — Saúde Fantasma"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_emenda_saude_vs_mortalidade AS
SELECT e.municipio,e.autor_emenda,
ROUND(SUM(e.valor_pago),2) AS total_emendas_saude,
m.taxa_mortalidade_infantil,m.obitos_infantis,
l.leitos_sus,l.leitos_uti_sus,
CASE
  WHEN m.taxa_mortalidade_infantil>20 AND SUM(e.valor_pago)>1000000 THEN "🔴 MILHÕES EM SAÚDE MAS MORTALIDADE INFANTIL ALTÍSSIMA"
  WHEN l.leitos_uti_sus=0 AND SUM(e.valor_pago)>500000 THEN "🔴 RECEBE EMENDA SAÚDE MAS ZERO LEITOS UTI SUS"
  ELSE "🟡 VERIFICAR"
END AS alerta
FROM '"$DS"'.emendas_pagas e
LEFT JOIN '"$DS"'.sus_mortalidade m ON e.id_ibge=m.id_municipio
LEFT JOIN '"$DS"'.sus_leitos l ON e.id_ibge=l.id_municipio
WHERE UPPER(e.area_atuacao)="SAÚDE"
GROUP BY 1,2,m.taxa_mortalidade_infantil,m.obitos_infantis,l.leitos_sus,l.leitos_uti_sus
ORDER BY total_emendas_saude DESC
' && echo "    ✅ View 43 — Emenda Saúde vs Mortalidade"

# --- MÓDULO 4: MÁFIAS ELEITORAIS ---
echo ""
echo "  📂 MÓDULO 4: Máfias Partidárias e Eleitorais"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_doador_vencedor AS
SELECT d.nome_doador,d.cpf_cnpj_doador,d.candidato_apoiado,
ROUND(d.valor_doado,2) AS valor_doado,
c.municipio,ROUND(c.valor,2) AS valor_contrato,c.objeto_contrato,
ROUND(c.valor/NULLIF(d.valor_doado,0),2) AS roi_corrupcao,
"🔴 DOADOR DE CAMPANHA GANHOU CONTRATO" AS alerta
FROM '"$DS"'.tse_doacoes d
JOIN '"$DS"'.contratos c ON REPLACE(REPLACE(d.cpf_cnpj_doador,".",""),"/","")=REPLACE(REPLACE(c.cnpj_vencedor,".",""),"/","")
ORDER BY valor_contrato DESC
' && echo "    ✅ View 44 — Doador Vencedor"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_monopolio_partidario AS
SELECT c.cnpj_vencedor,f.razaoSocial,p.sigla_partido,
COUNT(DISTINCT c.municipio) AS prefeituras,
ROUND(SUM(c.valor),2) AS volume,
"🔴 EMPRESA SÓ GANHA EM PREFEITURAS DO MESMO PARTIDO" AS alerta
FROM '"$DS"'.contratos c
JOIN '"$DS"'.prefeitos_eleitos p ON c.municipio=p.municipio
JOIN '"$DS"'.cnpj_enriquecido f ON REPLACE(REPLACE(c.cnpj_vencedor,".",""),"/","")=REPLACE(REPLACE(f.cnpj,".",""),"/","")
GROUP BY 1,2,3 HAVING prefeituras>=3
ORDER BY volume DESC
' && echo "    ✅ View 45 — Monopólio Partidário"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_cartel_socios AS
SELECT l1.id_licitacao,
s1.cnpj AS cnpj_1,s2.cnpj AS cnpj_2,
s1.nome_socio AS socio_em_comum,
"🔴 CARTEL — CONCORRENTES COM MESMO SÓCIO" AS alerta
FROM '"$DS"'.cnpj_socios s1
JOIN '"$DS"'.cnpj_socios s2 ON s1.cpf_socio=s2.cpf_socio AND s1.cnpj!=s2.cnpj
JOIN '"$DS"'.licitacoes_participantes l1 ON s1.cnpj=l1.cnpj
JOIN '"$DS"'.licitacoes_participantes l2 ON s2.cnpj=l2.cnpj AND l1.id_licitacao=l2.id_licitacao
GROUP BY 1,2,3,4
' && echo "    ✅ View 46 — Cartel de Sócios"

# --- MÓDULO 5: GEOGRÁFICO E SOBREPREÇO ---
echo ""
echo "  📂 MÓDULO 5: Padrões Geográficos e Sobrepreço"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_distancia_fantasma AS
SELECT c.id_contrato,c.municipio AS mun_contratante,
f.municipio AS mun_fornecedor,f.uf AS uf_fornecedor,
c.objeto_contrato,ROUND(c.valor,2) AS valor,
"🔴 SERVIÇO LOCAL CONTRATADO DE OUTRO ESTADO" AS alerta
FROM '"$DS"'.contratos c
JOIN '"$DS"'.cnpj_enriquecido f ON REPLACE(REPLACE(c.cnpj_vencedor,".",""),"/","")=REPLACE(REPLACE(f.cnpj,".",""),"/","")
WHERE (UPPER(c.objeto_contrato) LIKE "%LIMPEZA%" OR UPPER(c.objeto_contrato) LIKE "%CAPINA%" OR UPPER(c.objeto_contrato) LIKE "%MERENDA%" OR UPPER(c.objeto_contrato) LIKE "%CONSERVAÇÃO%")
AND f.uf!=c.uf_contratante
ORDER BY c.valor DESC
' && echo "    ✅ View 47 — Distância Geográfica Suspeita"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_sobrepreco_medicamentos AS
SELECT c.municipio,c.descricao_item,
ROUND(c.valor_unitario,2) AS preco_pago,
ROUND(b.preco_mediano_bancodeprecos,2) AS preco_referencia,
ROUND((c.valor_unitario/NULLIF(b.preco_mediano_bancodeprecos,0)-1)*100,1) AS pct_sobrepreco,
"🔴 SOBREPREÇO >50% EM MEDICAMENTOS" AS alerta
FROM '"$DS"'.itens_contratos c
JOIN '"$DS"'.banco_precos_saude b ON c.codigo_br_medicamento=b.codigo_br
WHERE c.valor_unitario>(b.preco_mediano_bancodeprecos*1.5)
ORDER BY pct_sobrepreco DESC
' && echo "    ✅ View 48 — Sobrepreço Medicamentos"

# --- MÓDULO 6: RH E FOLHA ---
echo ""
echo "  📂 MÓDULO 6: Recursos Humanos e Folha Fantasma"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_pagamento_mortos AS
SELECT f.mes_referencia,f.municipio,f.nome_servidor,
ROUND(f.salario_liquido,2) AS salario,
o.data_obito,
DATE_DIFF(SAFE.PARSE_DATE("%Y-%m",f.mes_referencia),SAFE.PARSE_DATE("%Y-%m-%d",o.data_obito),MONTH) AS meses_pos_obito,
"🔴 PAGAMENTO A SERVIDOR FALECIDO" AS alerta
FROM '"$DS"'.folha_pagamento f
JOIN '"$DS"'.obitos_sisobi o ON f.cpf=o.cpf
WHERE SAFE.PARSE_DATE("%Y-%m",f.mes_referencia)>SAFE.PARSE_DATE("%Y-%m-%d",o.data_obito)
ORDER BY f.salario_liquido DESC
' && echo "    ✅ View 49 — Pagamento a Mortos"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_acumulo_cargos AS
SELECT f1.nome_servidor,f1.cpf,
f1.municipio AS cidade_1,f1.cargo AS cargo_1,f1.carga_horaria AS horas_1,
f2.municipio AS cidade_2,f2.cargo AS cargo_2,f2.carga_horaria AS horas_2,
(f1.carga_horaria+f2.carga_horaria) AS total_horas,
ROUND(f1.salario_bruto+f2.salario_bruto,2) AS renda_total,
CASE
  WHEN f1.uf!=f2.uf THEN "🔴 ACÚMULO EM ESTADOS DIFERENTES"
  WHEN (f1.carga_horaria+f2.carga_horaria)>70 THEN "🔴 CARGA >70H SEMANAIS"
  ELSE "🟠 ACÚMULO SUSPEITO"
END AS alerta
FROM '"$DS"'.folha_pagamento f1
JOIN '"$DS"'.folha_pagamento f2 ON f1.cpf=f2.cpf AND f1.municipio!=f2.municipio
WHERE (f1.carga_horaria+f2.carga_horaria)>60 OR f1.uf!=f2.uf
' && echo "    ✅ View 50 — Acúmulo Ilegal de Cargos"

# --- MÓDULO 7 (BÔNUS): PROGRAMAS SOCIAIS CRUZADOS ---
echo ""
echo "  📂 MÓDULO 7: Cruzamento Programas Sociais"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_servidor_bolsa_familia AS
SELECT f.nome_servidor,f.cpf,f.cargo,f.municipio,
ROUND(f.salario_bruto,2) AS salario,
bf.valorParcela AS valor_bf,
"🔴 SERVIDOR PÚBLICO RECEBENDO BOLSA FAMÍLIA" AS alerta
FROM '"$DS"'.folha_pagamento f
JOIN '"$DS"'.bolsa_familia bf ON f.cpf=bf.cpf
WHERE f.salario_bruto>3000
ORDER BY f.salario_bruto DESC
' && echo "    ✅ View 51 — Servidor no Bolsa Família"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_servidor_bpc AS
SELECT f.nome_servidor,f.cpf,f.cargo,f.municipio,
ROUND(f.salario_bruto,2) AS salario,
b.tipo_beneficio,ROUND(b.valor,2) AS valor_bpc,
"🔴 SERVIDOR RECEBENDO BPC (BENEFÍCIO PARA QUEM NÃO PODE TRABALHAR)" AS alerta
FROM '"$DS"'.folha_pagamento f
JOIN '"$DS"'.bpc_beneficiarios b ON f.cpf=b.cpf
ORDER BY f.salario_bruto DESC
' && echo "    ✅ View 52 — Servidor no BPC"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_servidor_seguro_defeso AS
SELECT f.nome_servidor,f.cpf,f.cargo,f.municipio,
ROUND(f.salario_bruto,2) AS salario,
sd.valor AS valor_defeso,
"🔴 SERVIDOR RECEBENDO SEGURO DEFESO (EXCLUSIVO PARA PESCADORES)" AS alerta
FROM '"$DS"'.folha_pagamento f
JOIN '"$DS"'.seguro_defeso sd ON f.cpf=sd.cpf
ORDER BY f.salario_bruto DESC
' && echo "    ✅ View 53 — Servidor no Seguro Defeso"

# --- MÓDULO 8 (BÔNUS): QUERIDO DIÁRIO ---
echo ""
echo "  📂 MÓDULO 8: Querido Diário + Diários Oficiais"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_diario_vs_doador AS
SELECT d.municipio,d.data_publicacao,d.excerto,
t.nome_doador,ROUND(t.valor_doado,2) AS valor_doado,
t.candidato_apoiado,
"🔴 NOME DE DOADOR DE CAMPANHA ENCONTRADO NO DIÁRIO OFICIAL" AS alerta
FROM '"$DS"'.diarios_oficiais d
JOIN '"$DS"'.tse_doacoes t ON UPPER(d.excerto) LIKE CONCAT("%",UPPER(t.nome_doador),"%")
AND d.id_municipio=t.municipio
' && echo "    ✅ View 54 — Doador no Diário Oficial"

# --- MÓDULO 9 (BÔNUS): PATRIMÔNIO ---
echo ""
echo "  📂 MÓDULO 9: Evolução Patrimonial"

bq query --use_legacy_sql=false '
CREATE OR REPLACE VIEW '"$DS"'.forense_enriquecimento AS
WITH por_eleicao AS (
  SELECT cpf,nome,ano_eleicao,SUM(valor_bem) AS patrimonio
  FROM '"$DS"'.patrimonio_declarado GROUP BY 1,2,3
),
evolucao AS (
  SELECT a.cpf,a.nome,
  a.ano_eleicao AS eleicao_anterior,a.patrimonio AS patrimonio_antes,
  b.ano_eleicao AS eleicao_atual,b.patrimonio AS patrimonio_depois,
  ROUND(b.patrimonio-a.patrimonio,2) AS crescimento,
  ROUND((b.patrimonio/NULLIF(a.patrimonio,0)-1)*100,1) AS pct_crescimento
  FROM por_eleicao a
  JOIN por_eleicao b ON a.cpf=b.cpf AND b.ano_eleicao>a.ano_eleicao
)
SELECT *,
CASE
  WHEN pct_crescimento>500 THEN "🔴 ENRIQUECIMENTO >500% ENTRE ELEIÇÕES"
  WHEN pct_crescimento>200 THEN "🟠 CRESCIMENTO PATRIMONIAL >200%"
  WHEN crescimento>5000000 THEN "🔴 CRESCEU >R$5M EM UM MANDATO"
  ELSE "🟡 MONITORAR"
END AS alerta
FROM evolucao
ORDER BY crescimento DESC
' && echo "    ✅ View 55 — Enriquecimento Ilícito"

# ==========================================
# PARTE 3: CONTAGEM FINAL
# ==========================================
echo ""
echo "🔥 =============================================="
echo "   PROTOCOLO A.S.M.O.D.E.U.S. — DEPLOY COMPLETO"
echo "🔥 =============================================="
echo ""
echo "📊 INVENTÁRIO FINAL:"
echo "   Tabelas: $(bq ls $DS | grep -c TABLE)"
echo "   Views:   $(bq ls $DS | grep -c VIEW)"
echo ""
echo "📡 APIs MAPEADAS PARA INGESTÃO:"
echo "   • Câmara dos Deputados — dadosabertos.camara.leg.br/api/v2"
echo "   • Portal da Transparência CGU — api.portaldatransparencia.gov.br"
echo "   • Querido Diário — queridodiario.ok.org.br/api"
echo "   • TCE-SP — transparencia.tce.sp.gov.br/api"
echo "   • TCE-PE — sistemas.tce.pe.gov.br/DadosAbertos"
echo "   • TCE-SC — servicos.tcesc.tc.br/endpoints-portal-transparencia"
echo "   • SIOP/LOA — www1.siop.planejamento.gov.br"
echo "   • IBGE — servicodados.ibge.gov.br/api"
echo "   • DATASUS — opendatasus.saude.gov.br"
echo "   • TSE — dadosabertos.tse.jus.br"
echo ""
echo "🔥 O INFERNO ESTÁ ONLINE. 🔥"
