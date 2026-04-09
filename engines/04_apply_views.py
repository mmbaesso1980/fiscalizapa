"""
A.S.M.O.D.E.U.S. — Views Forenses no BigQuery (projeto-codex-br).

Fonte canônica: engines/legacy/protocolo-asmodeus-v2-guia-mestre.md
                engines/legacy/protocolo-asmodeus-setup.sh

Módulos incluídos (Parte III do guia-mestre):
  10 — Calculadora Automática de Elegibilidade
       → fiscalizapa.forense_elegibilidade_parlamentar
  11 — Inelegibilidade Reflexa / Parentesco
       → fiscalizapa.forense_inelegibilidade_reflexa
  12 — Educação Fantasma
       → fiscalizapa.forense_educacao_fantasma
  13 — Correlação Emenda × Criminalidade
       → fiscalizapa.forense_emenda_vs_violencia
  14 — RPPS Podre
       → fiscalizapa.forense_rpps_fundo_podre
  15 — OSINT — Correlação Notícia × Contrato × Desmatamento
       → fiscalizapa.forense_osint_triangulacao

Módulos de setup.sh (Parte 2):
  1  — CNAE Incompatível         → forense_cnae_incompativel
  2  — Empresa Recém-Nascida     → forense_empresa_recem_nascida
  3  — Fracionamento de Despesas → forense_fracionamento_despesas
  4  — Fornecedor Punido         → forense_fornecedor_punido
  5  — Pão e Circo               → forense_pao_e_circo_arenas
  6  — Obras IDH Decrescente     → forense_gastos_vs_idh_decrescente
  7  — Saúde Fantasma            → forense_saude_fantasma
  8  — Emenda Saúde vs Mortalidade → forense_emenda_saude_vs_mortalidade
  9  — Doador Vencedor           → forense_doador_vencedor
  10 — Monopólio Partidário      → forense_monopolio_partidario
  11 — Cartel de Sócios          → forense_cartel_socios
  12 — Distância Geográfica      → forense_distancia_fantasma
  13 — Sobrepreço Medicamentos   → forense_sobrepreco_medicamentos
  14 — Pagamento a Mortos        → forense_pagamento_mortos
  15 — Acúmulo Ilegal de Cargos  → forense_acumulo_cargos
  16 — Servidor no Bolsa Família → forense_servidor_bolsa_familia
  17 — Servidor no BPC           → forense_servidor_bpc
  18 — Servidor no Seguro Defeso → forense_servidor_seguro_defeso
  19 — Doador no Diário Oficial  → forense_diario_vs_doador
  20 — Enriquecimento Ilícito    → forense_enriquecimento

Executa cada DDL usando client.query(sql).result() com try/except
individual — uma falha não cancela as demais views.
"""

from __future__ import annotations

import argparse
import os
import sys

from google.cloud import bigquery
from google.cloud.exceptions import GoogleCloudError

DEFAULT_BQ_PROJECT = "projeto-codex-br"
_ENV_PROJECT = "GCP_PROJECT_ID"

# ═══════════════════════════════════════════════════════════════════════════════
# MÓDULO 10 — Calculadora Automática de Elegibilidade (Ficha Limpa)
# Query EXATA do protocolo-asmodeus-v2-guia-mestre.md
# Cobre alíneas D, E, G, J, K, L, O e e.8 da LC 64/90 + LC 135/2010
# Depende de: processos_eleitorais, processos_judiciais, contas_julgadas,
#             cassacoes_renuncias, lista_suja_trabalho_escravo,
#             tse_candidatos
# ═══════════════════════════════════════════════════════════════════════════════
SQL_MOD10_ELEGIBILIDADE = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_elegibilidade_parlamentar` AS
WITH ficha_limpa AS (
  -- Alínea D: Abuso de poder
  SELECT cpf, 'AIJE/AIME procedente — abuso de poder' AS causa,
    data_decisao,
    DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_decisao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM `fiscalizapa.processos_eleitorais`
  WHERE resultado = 'Procedente' AND tipo IN ('AIJE','AIME')

  UNION ALL

  -- Alínea E: Condenações criminais
  SELECT cpf, CONCAT('Condenação criminal: ', assunto) AS causa,
    data_decisao,
    DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_decisao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM `fiscalizapa.processos_judiciais`
  WHERE situacao = 'Condenado' AND (
    assunto LIKE '%administração pública%' OR assunto LIKE '%lavagem%'
    OR assunto LIKE '%tráfico%' OR assunto LIKE '%organização criminosa%'
    OR assunto LIKE '%patrimônio público%' OR assunto LIKE '%corrupção%'
    OR assunto LIKE '%peculato%' OR assunto LIKE '%improbidade%'
  )

  UNION ALL

  -- Alínea G: Contas rejeitadas TCE/TCU
  SELECT cpf,
    CONCAT('Contas rejeitadas ', tribunal, ' exercício ', CAST(exercicio AS STRING)) AS causa,
    data_julgamento,
    DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_julgamento), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM `fiscalizapa.contas_julgadas`
  WHERE parecer = 'Irregular'
    AND gera_inelegibilidade = TRUE
    AND transitou_em_julgado = TRUE

  UNION ALL

  -- Alínea J: Corrupção eleitoral
  SELECT cpf, 'Corrupção eleitoral / captação ilícita de sufrágio' AS causa,
    data_decisao,
    DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_decisao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM `fiscalizapa.processos_eleitorais`
  WHERE resultado = 'Procedente' AND tipo LIKE '%corrupção eleitoral%'

  UNION ALL

  -- Alínea K: Renúncia para fugir de processo
  SELECT cpf, 'Renúncia após representação — alínea K' AS causa,
    data_evento AS data_decisao,
    DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_evento), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM `fiscalizapa.cassacoes_renuncias`
  WHERE tipo = 'Renúncia' AND houve_representacao_antes = TRUE

  UNION ALL

  -- Alínea L: Improbidade com suspensão de direitos políticos
  SELECT cpf, 'Improbidade: lesão ao patrimônio + enriquecimento ilícito' AS causa,
    data_decisao,
    DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_decisao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM `fiscalizapa.processos_judiciais`
  WHERE assunto LIKE '%improbidade%' AND situacao = 'Condenado'

  UNION ALL

  -- Alínea O: Demissão por improbidade
  SELECT cpf, 'Demissão do serviço público por improbidade' AS causa,
    data_decisao,
    DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_decisao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM `fiscalizapa.processos_judiciais`
  WHERE assunto LIKE '%demissão%improbidade%'

  UNION ALL

  -- Lista Suja — alínea e.8 (Trabalho Escravo)
  SELECT cpf_cnpj AS cpf,
    'Condenação por trabalho escravo — alínea e.8' AS causa,
    data_inclusao AS data_decisao,
    DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_inclusao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM `fiscalizapa.lista_suja_trabalho_escravo`
)
SELECT
  fl.cpf,
  COALESCE(t.nome, p.nome, fl.cpf) AS nome,
  fl.causa,
  fl.data_decisao,
  fl.fim_inelegibilidade,
  CASE
    WHEN fl.fim_inelegibilidade > CURRENT_DATE() THEN '🔴 INELEGÍVEL'
    ELSE '🟢 ELEGÍVEL (prazo expirado)'
  END AS status_elegibilidade,
  DATE_DIFF(fl.fim_inelegibilidade, CURRENT_DATE(), DAY) AS dias_restantes
FROM ficha_limpa fl
LEFT JOIN `fiscalizapa.tse_candidatos` t ON fl.cpf = t.cpf
LEFT JOIN `fiscalizapa.processos_judiciais` p ON fl.cpf = p.cpf_cnpj
WHERE fl.fim_inelegibilidade > DATE_SUB(CURRENT_DATE(), INTERVAL 2 YEAR)
ORDER BY fl.fim_inelegibilidade DESC;
"""

# ═══════════════════════════════════════════════════════════════════════════════
# MÓDULO 11 — Inelegibilidade Reflexa / Parentesco
# Query EXATA do protocolo-asmodeus-v2-guia-mestre.md
# Cobre §3º Art. 1º LC 64/90 (cônjuge e parentes até 2º grau de
# Prefeito/Governador/Presidente — inelegíveis no território de jurisdição)
# Depende de: parentesco_politico
# ═══════════════════════════════════════════════════════════════════════════════
SQL_MOD11_INELEGIBILIDADE_REFLEXA = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_inelegibilidade_reflexa` AS
SELECT
  pp.cpf_parente,
  pp.nome_parente,
  pp.grau_parentesco,
  pp.cpf_politico,
  pp.nome_politico AS titular_executivo,
  pp.cargo_politico,
  pp.municipio_jurisdicao,
  '🔴 INELEGÍVEL POR PARENTESCO (§3º Art.1º LC 64/90)' AS alerta
FROM `fiscalizapa.parentesco_politico` pp
WHERE pp.cargo_politico IN ('Prefeito','Governador','Presidente')
  AND pp.grau_parentesco IN (
    'Cônjuge','1º grau','2º grau','Afim 1º grau','Afim 2º grau','Adoção'
  );
"""

# ═══════════════════════════════════════════════════════════════════════════════
# MÓDULO 12 — Educação Fantasma (Dinheiro sem Resultado)
# ═══════════════════════════════════════════════════════════════════════════════
SQL_MOD12_EDUCACAO_FANTASMA = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_educacao_fantasma` AS
SELECT
  f.municipio,
  f.programa,
  ROUND(SUM(f.valor_repassado), 2) AS total_repasses_fnde,
  s.pct_aplicado_educacao,
  i.ideb_observado,
  i.ideb_meta,
  ce.total_escolas_sem_agua,
  CASE
    WHEN s.pct_aplicado_educacao < 25
      THEN '🔴 MUNICÍPIO APLICA <25% EM EDUCAÇÃO (INCONSTITUCIONAL)'
    WHEN i.ideb_observado < i.ideb_meta AND SUM(f.valor_repassado) > 5000000
      THEN '🔴 MILHÕES RECEBIDOS MAS IDEB ABAIXO DA META'
    WHEN ce.total_escolas_sem_agua > 10
      THEN '🟠 ESCOLAS SEM ÁGUA POTÁVEL'
    ELSE '🟡 MONITORAR'
  END AS alerta
FROM `fiscalizapa.fnde_repasses` f
LEFT JOIN `fiscalizapa.siconfi_educacao` s
  ON f.id_municipio = s.id_municipio AND f.ano = s.ano
LEFT JOIN `fiscalizapa.ideb_municipios` i
  ON f.id_municipio = i.id_municipio AND f.ano = i.ano AND i.etapa = 'Anos Iniciais'
LEFT JOIN (
  SELECT id_municipio, COUNT(*) AS total_escolas_sem_agua
  FROM `fiscalizapa.censo_escolar`
  WHERE tem_agua_potavel = FALSE
  GROUP BY 1
) ce ON f.id_municipio = ce.id_municipio
GROUP BY 1, 2, s.pct_aplicado_educacao, i.ideb_observado, i.ideb_meta, ce.total_escolas_sem_agua
ORDER BY total_repasses_fnde DESC;
"""

# ═══════════════════════════════════════════════════════════════════════════════
# MÓDULO 13 — Correlação Emenda × Criminalidade
# ═══════════════════════════════════════════════════════════════════════════════
SQL_MOD13_EMENDA_VS_VIOLENCIA = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_emenda_vs_violencia` AS
SELECT
  e.municipio_destino,
  e.nomeDeputado,
  ROUND(SUM(e.valor_pago), 2) AS total_emendas_seguranca,
  s.homicidios_dolosos,
  s.taxa_homicidios_100k,
  LAG(s.taxa_homicidios_100k)
    OVER (PARTITION BY e.municipio_destino ORDER BY s.ano) AS taxa_ano_anterior,
  CASE
    WHEN s.taxa_homicidios_100k > 30 AND SUM(e.valor_pago) > 1000000
      THEN '🔴 EMENDAS DE SEGURANÇA MAS HOMICÍDIOS >30/100K'
    WHEN s.taxa_homicidios_100k
         > LAG(s.taxa_homicidios_100k)
             OVER (PARTITION BY e.municipio_destino ORDER BY s.ano)
         AND SUM(e.valor_pago) > 500000
      THEN '🟠 VIOLÊNCIA SUBINDO APESAR DAS EMENDAS'
    ELSE '🟡 MONITORAR'
  END AS alerta
FROM `fiscalizapa.emendas_parlamentares` e
LEFT JOIN `fiscalizapa.sinesp_ocorrencias` s
  ON e.id_ibge_destino = s.id_municipio AND e.ano = s.ano
WHERE UPPER(e.funcao) LIKE '%SEGURANÇA%'
GROUP BY 1, 2, s.homicidios_dolosos, s.taxa_homicidios_100k, s.ano
ORDER BY total_emendas_seguranca DESC;
"""

# ═══════════════════════════════════════════════════════════════════════════════
# MÓDULO 14 — RPPS Podre (O Próximo "Caso Vorcaro")
# ═══════════════════════════════════════════════════════════════════════════════
SQL_MOD14_RPPS_FUNDO_PODRE = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_rpps_fundo_podre` AS
SELECT
  r.municipio,
  r.nome_rpps,
  r.nome_fundo_investido,
  r.cnpj_fundo_investido,
  ROUND(r.valor_investido,   2) AS valor_investido,
  ROUND(r.pct_patrimonio,    2) AS pct_patrimonio_rpps,
  f.tipo_fundo,
  f.nome_gestor,
  f.rentabilidade_mes,
  CASE
    WHEN f.tipo_fundo IN ('FIDC','FIP') AND r.pct_patrimonio > 15
      THEN '🔴 >15% DO RPPS EM FUNDO DE ALTO RISCO'
    WHEN f.rentabilidade_mes < -5
      THEN '🔴 FUNDO COM RENTABILIDADE NEGATIVA >5%'
    WHEN f.qtd_cotistas < 5
      THEN '🟠 FUNDO COM <5 COTISTAS (POSSÍVEL VEÍCULO EXCLUSIVO)'
    ELSE '🟡 MONITORAR'
  END AS alerta
FROM `fiscalizapa.rpps_investimentos` r
JOIN `fiscalizapa.cvm_fundos` f ON r.cnpj_fundo_investido = f.cnpj_fundo
ORDER BY r.valor_investido DESC;
"""

# ═══════════════════════════════════════════════════════════════════════════════
# MÓDULO 15 — OSINT: Correlação Notícia × Contrato × Desmatamento
# ═══════════════════════════════════════════════════════════════════════════════
SQL_MOD15_OSINT_TRIANGULACAO = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_osint_triangulacao` AS
SELECT
  n.municipio_relacionado AS municipio,
  n.titulo                AS manchete,
  n.sentimento,
  n.data_publicacao,
  c.objeto_contrato,
  ROUND(c.valor, 2)       AS valor_contrato,
  c.cnpj_vencedor,
  m.area_desmatada_ha,
  m.tem_autorizacao,
  CASE
    WHEN n.sentimento < -0.5 AND c.valor > 500000
      THEN '🔴 NOTÍCIA NEGATIVA + CONTRATO ALTO NO MESMO MUNICÍPIO'
    WHEN m.area_desmatada_ha > 100 AND m.tem_autorizacao = FALSE
      THEN '🔴 DESMATAMENTO ILEGAL + CONTRATOS SUSPEITOS'
    ELSE '🟠 CORRELAÇÃO DETECTADA'
  END AS alerta
FROM `fiscalizapa.news_clips` n
LEFT JOIN `fiscalizapa.contratos` c
  ON n.municipio_relacionado = c.municipio
  AND ABS(DATE_DIFF(
        SAFE.PARSE_DATE('%Y-%m-%d', n.data_publicacao),
        SAFE.PARSE_DATE('%Y-%m-%d', c.data_assinatura),
        DAY)) <= 90
LEFT JOIN `fiscalizapa.mapbiomas_alertas` m
  ON n.municipio_relacionado = m.municipio
  AND ABS(DATE_DIFF(
        SAFE.PARSE_DATE('%Y-%m-%d', n.data_publicacao),
        SAFE.PARSE_DATE('%Y-%m-%d', m.data_deteccao),
        DAY)) <= 180
WHERE n.sentimento < -0.3 OR m.area_desmatada_ha > 50
ORDER BY n.sentimento ASC;
"""

# ═══════════════════════════════════════════════════════════════════════════════
# MÓDULOS 1–20 do setup.sh (views forenses operacionais)
# ═══════════════════════════════════════════════════════════════════════════════
SQL_SETUP_CNAE_INCOMPATIVEL = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_cnae_incompativel` AS
SELECT c.id_contrato, c.municipio, c.objeto_contrato, c.valor,
  f.cnpj, f.razaoSocial, f.cnaeDescricao AS cnae_principal_descricao,
  '🔴 OBJETO INCOMPATÍVEL COM CNAE' AS alerta
FROM `fiscalizapa.contratos` c
JOIN `fiscalizapa.cnpj_enriquecido` f
  ON REPLACE(REPLACE(c.cnpj_vencedor,'.',''),'/','') = REPLACE(REPLACE(f.cnpj,'.',''),'/','')
WHERE
  (UPPER(c.objeto_contrato) LIKE '%MEDICAMENTO%' AND UPPER(f.cnaeDescricao) NOT LIKE '%FARMAC%' AND UPPER(f.cnaeDescricao) NOT LIKE '%MEDIC%')
  OR (UPPER(c.objeto_contrato) LIKE '%MERENDA%'   AND UPPER(f.cnaeDescricao) NOT LIKE '%ALIMENT%' AND UPPER(f.cnaeDescricao) NOT LIKE '%REFEI%')
  OR (UPPER(c.objeto_contrato) LIKE '%ASFALTO%'   AND UPPER(f.cnaeDescricao) NOT LIKE '%CONSTRU%' AND UPPER(f.cnaeDescricao) NOT LIKE '%ENGENH%')
  OR (UPPER(c.objeto_contrato) LIKE '%SHOW%'       AND UPPER(f.cnaeDescricao) NOT LIKE '%ESPETAC%' AND UPPER(f.cnaeDescricao) NOT LIKE '%EVENT%')
  OR (UPPER(c.objeto_contrato) LIKE '%TRANSPORTE%' AND UPPER(f.cnaeDescricao) NOT LIKE '%TRANSPORT%' AND UPPER(f.cnaeDescricao) NOT LIKE '%LOGIST%')
ORDER BY c.valor DESC;
"""

SQL_SETUP_EMPRESA_RECEM_NASCIDA = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_empresa_recem_nascida` AS
SELECT l.id_licitacao, l.municipio, l.data_homologacao,
  f.cnpj, f.razaoSocial, f.dataAbertura AS data_abertura,
  DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', l.data_homologacao),
            SAFE.PARSE_DATE('%Y-%m-%d', f.dataAbertura), DAY) AS dias_de_vida,
  l.valor_vencedor,
  '🔴 EMPRESA <90 DIAS GANHOU LICITAÇÃO' AS alerta
FROM `fiscalizapa.licitacoes` l
JOIN `fiscalizapa.cnpj_enriquecido` f
  ON REPLACE(REPLACE(l.cnpj_vencedor,'.',''),'/','') = REPLACE(REPLACE(f.cnpj,'.',''),'/','')
WHERE DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', l.data_homologacao),
                SAFE.PARSE_DATE('%Y-%m-%d', f.dataAbertura), DAY) <= 90
ORDER BY l.valor_vencedor DESC;
"""

SQL_SETUP_FRACIONAMENTO = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_fracionamento_despesas` AS
SELECT cnpj_vencedor, municipio,
  COUNT(id_contrato) AS qtd_dispensas,
  ROUND(SUM(valor), 2) AS valor_total,
  '🔴 FRACIONAMENTO PARA FUGIR DE LICITAÇÃO' AS alerta
FROM `fiscalizapa.contratos`
WHERE modalidade = 'DISPENSA'
GROUP BY 1, 2
HAVING qtd_dispensas >= 3 AND valor_total > 50000
ORDER BY valor_total DESC;
"""

SQL_SETUP_FORNECEDOR_PUNIDO = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_fornecedor_punido` AS
SELECT c.id_contrato, c.municipio, c.data_assinatura, c.valor,
  s.cnpj, s.motivo_punicao, s.data_fim_punicao,
  '🔴 CONTRATO COM EMPRESA SUSPENSA/INIDÔNEA' AS alerta
FROM `fiscalizapa.contratos` c
JOIN `fiscalizapa.sicaf_punicoes` s
  ON REPLACE(REPLACE(c.cnpj_vencedor,'.',''),'/','') = REPLACE(REPLACE(s.cnpj,'.',''),'/','')
WHERE SAFE.PARSE_DATE('%Y-%m-%d', c.data_assinatura)
  BETWEEN SAFE.PARSE_DATE('%Y-%m-%d', s.data_inicio_punicao)
      AND SAFE.PARSE_DATE('%Y-%m-%d', s.data_fim_punicao)
ORDER BY c.valor DESC;
"""

SQL_SETUP_PAO_E_CIRCO = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_pao_e_circo_arenas` AS
SELECT c.municipio, c.objeto_contrato, c.valor AS custo_evento,
  i.populacao, ROUND(c.valor / i.populacao, 2) AS custo_per_capita,
  i2.pct_sem_esgoto, i2.idh_atual AS idhm,
  '🔴 SHOW CUSTANDO >R$50/HABITANTE' AS alerta
FROM `fiscalizapa.contratos` c
JOIN `fiscalizapa.ibge_municipios` i ON c.id_ibge = i.id_municipio
LEFT JOIN `fiscalizapa.ibge_indicadores` i2 ON c.id_ibge = i2.id_municipio
WHERE (
  UPPER(c.objeto_contrato) LIKE '%SHOW%' OR UPPER(c.objeto_contrato) LIKE '%FESTIV%'
  OR UPPER(c.objeto_contrato) LIKE '%ARENA%' OR UPPER(c.objeto_contrato) LIKE '%ARTISTA%'
  OR UPPER(c.objeto_contrato) LIKE '%MUSICAL%'
) AND (c.valor / NULLIF(i.populacao, 0)) > 50
ORDER BY custo_per_capita DESC;
"""

SQL_SETUP_OBRAS_IDH_QUEDA = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_gastos_vs_idh_decrescente` AS
SELECT c.municipio, ROUND(SUM(c.valor), 2) AS total_gasto_infra,
  i.idh_anterior, i.idh_atual,
  ROUND(i.idh_atual - i.idh_anterior, 4) AS variacao_idh,
  '🔴 OBRAS MILIONÁRIAS MAS IDH CAIU' AS alerta
FROM `fiscalizapa.contratos` c
JOIN `fiscalizapa.ibge_indicadores` i ON c.id_ibge = i.id_municipio
WHERE UPPER(c.objeto_contrato) LIKE '%CONSTRU%'
   OR UPPER(c.objeto_contrato) LIKE '%OBRA%'
   OR UPPER(c.objeto_contrato) LIKE '%REFORM%'
GROUP BY c.municipio, i.idh_anterior, i.idh_atual
HAVING SUM(c.valor) > 10000000 AND i.idh_atual < i.idh_anterior
ORDER BY total_gasto_infra DESC;
"""

SQL_SETUP_SAUDE_FANTASMA = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_saude_fantasma` AS
SELECT e.municipio, e.autor_emenda, e.valor_pago AS valor_emenda_saude,
  e.objeto_emenda,
  COALESCE(s.qtd_procedimentos, 0) AS procedimentos_sus,
  CASE
    WHEN COALESCE(s.qtd_procedimentos, 0) < 100  AND e.valor_pago > 1000000
      THEN '🔴 EMENDA MILIONÁRIA SEM REFLEXO NO SUS'
    WHEN COALESCE(s.qtd_procedimentos, 0) < 500  AND e.valor_pago > 500000
      THEN '🟠 BAIXO IMPACTO NO SUS'
    ELSE '🟡 VERIFICAR'
  END AS alerta
FROM `fiscalizapa.emendas_pagas` e
LEFT JOIN (
  SELECT id_municipio, SUM(quantidade) AS qtd_procedimentos
  FROM `fiscalizapa.sus_producao_ambulatorial`
  GROUP BY 1
) s ON e.id_ibge = s.id_municipio
WHERE UPPER(e.area_atuacao) = 'SAÚDE' AND e.valor_pago > 500000
ORDER BY e.valor_pago DESC;
"""

SQL_SETUP_SAUDE_VS_MORTALIDADE = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_emenda_saude_vs_mortalidade` AS
SELECT e.municipio, e.autor_emenda,
  ROUND(SUM(e.valor_pago), 2) AS total_emendas_saude,
  m.taxa_mortalidade_infantil, m.obitos_infantis,
  l.leitos_sus, l.leitos_uti_sus,
  CASE
    WHEN m.taxa_mortalidade_infantil > 20 AND SUM(e.valor_pago) > 1000000
      THEN '🔴 MILHÕES EM SAÚDE MAS MORTALIDADE INFANTIL ALTÍSSIMA'
    WHEN l.leitos_uti_sus = 0 AND SUM(e.valor_pago) > 500000
      THEN '🔴 RECEBE EMENDA SAÚDE MAS ZERO LEITOS UTI SUS'
    ELSE '🟡 VERIFICAR'
  END AS alerta
FROM `fiscalizapa.emendas_pagas` e
LEFT JOIN `fiscalizapa.sus_mortalidade`  m ON e.id_ibge = m.id_municipio
LEFT JOIN `fiscalizapa.sus_leitos`       l ON e.id_ibge = l.id_municipio
WHERE UPPER(e.area_atuacao) = 'SAÚDE'
GROUP BY 1, 2, m.taxa_mortalidade_infantil, m.obitos_infantis, l.leitos_sus, l.leitos_uti_sus
ORDER BY total_emendas_saude DESC;
"""

SQL_SETUP_DOADOR_VENCEDOR = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_doador_vencedor` AS
SELECT d.nome_doador, d.cpf_cnpj_doador, d.candidato_apoiado,
  ROUND(d.valor_doado, 2) AS valor_doado,
  c.municipio, ROUND(c.valor, 2) AS valor_contrato, c.objeto_contrato,
  ROUND(c.valor / NULLIF(d.valor_doado, 0), 2) AS roi_corrupcao,
  '🔴 DOADOR DE CAMPANHA GANHOU CONTRATO' AS alerta
FROM `fiscalizapa.tse_doacoes` d
JOIN `fiscalizapa.contratos` c
  ON REPLACE(REPLACE(d.cpf_cnpj_doador,'.',''),'/','') = REPLACE(REPLACE(c.cnpj_vencedor,'.',''),'/','')
ORDER BY valor_contrato DESC;
"""

SQL_SETUP_MONOPOLIO_PARTIDARIO = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_monopolio_partidario` AS
SELECT c.cnpj_vencedor, f.razaoSocial, p.sigla_partido,
  COUNT(DISTINCT c.municipio) AS prefeituras,
  ROUND(SUM(c.valor), 2) AS volume,
  '🔴 EMPRESA SÓ GANHA EM PREFEITURAS DO MESMO PARTIDO' AS alerta
FROM `fiscalizapa.contratos` c
JOIN `fiscalizapa.prefeitos_eleitos`  p ON c.municipio = p.municipio
JOIN `fiscalizapa.cnpj_enriquecido`   f
  ON REPLACE(REPLACE(c.cnpj_vencedor,'.',''),'/','') = REPLACE(REPLACE(f.cnpj,'.',''),'/','')
GROUP BY 1, 2, 3
HAVING prefeituras >= 3
ORDER BY volume DESC;
"""

SQL_SETUP_CARTEL_SOCIOS = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_cartel_socios` AS
SELECT l1.id_licitacao,
  s1.cnpj AS cnpj_1, s2.cnpj AS cnpj_2,
  s1.nome_socio AS socio_em_comum,
  '🔴 CARTEL — CONCORRENTES COM MESMO SÓCIO' AS alerta
FROM `fiscalizapa.cnpj_socios` s1
JOIN `fiscalizapa.cnpj_socios` s2
  ON s1.cpf_socio = s2.cpf_socio AND s1.cnpj != s2.cnpj
JOIN `fiscalizapa.licitacoes_participantes` l1 ON s1.cnpj = l1.cnpj
JOIN `fiscalizapa.licitacoes_participantes` l2
  ON s2.cnpj = l2.cnpj AND l1.id_licitacao = l2.id_licitacao
GROUP BY 1, 2, 3, 4;
"""

SQL_SETUP_DISTANCIA_GEOGRAFICA = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_distancia_fantasma` AS
SELECT c.id_contrato, c.municipio AS mun_contratante,
  f.municipio AS mun_fornecedor, f.uf AS uf_fornecedor,
  c.objeto_contrato, ROUND(c.valor, 2) AS valor,
  '🔴 SERVIÇO LOCAL CONTRATADO DE OUTRO ESTADO' AS alerta
FROM `fiscalizapa.contratos` c
JOIN `fiscalizapa.cnpj_enriquecido` f
  ON REPLACE(REPLACE(c.cnpj_vencedor,'.',''),'/','') = REPLACE(REPLACE(f.cnpj,'.',''),'/','')
WHERE (
  UPPER(c.objeto_contrato) LIKE '%LIMPEZA%'  OR UPPER(c.objeto_contrato) LIKE '%CAPINA%'
  OR UPPER(c.objeto_contrato) LIKE '%MERENDA%' OR UPPER(c.objeto_contrato) LIKE '%CONSERVAÇÃO%'
) AND f.uf != c.uf_contratante
ORDER BY c.valor DESC;
"""

SQL_SETUP_SOBREPRECO = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_sobrepreco_medicamentos` AS
SELECT c.municipio, c.descricao_item,
  ROUND(c.valor_unitario, 2) AS preco_pago,
  ROUND(b.preco_mediano_bancodeprecos, 2) AS preco_referencia,
  ROUND((c.valor_unitario / NULLIF(b.preco_mediano_bancodeprecos, 0) - 1) * 100, 1) AS pct_sobrepreco,
  '🔴 SOBREPREÇO >50% EM MEDICAMENTOS' AS alerta
FROM `fiscalizapa.itens_contratos` c
JOIN `fiscalizapa.banco_precos_saude` b ON c.codigo_br_medicamento = b.codigo_br
WHERE c.valor_unitario > (b.preco_mediano_bancodeprecos * 1.5)
ORDER BY pct_sobrepreco DESC;
"""

SQL_SETUP_PAGAMENTO_MORTOS = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_pagamento_mortos` AS
SELECT f.mes_referencia, f.municipio, f.nome_servidor,
  ROUND(f.salario_liquido, 2) AS salario,
  o.data_obito,
  DATE_DIFF(SAFE.PARSE_DATE('%Y-%m', f.mes_referencia),
            SAFE.PARSE_DATE('%Y-%m-%d', o.data_obito), MONTH) AS meses_pos_obito,
  '🔴 PAGAMENTO A SERVIDOR FALECIDO' AS alerta
FROM `fiscalizapa.folha_pagamento` f
JOIN `fiscalizapa.obitos_sisobi` o ON f.cpf = o.cpf
WHERE SAFE.PARSE_DATE('%Y-%m', f.mes_referencia) > SAFE.PARSE_DATE('%Y-%m-%d', o.data_obito)
ORDER BY f.salario_liquido DESC;
"""

SQL_SETUP_ACUMULO_CARGOS = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_acumulo_cargos` AS
SELECT f1.nome_servidor, f1.cpf,
  f1.municipio AS cidade_1, f1.cargo AS cargo_1, f1.carga_horaria AS horas_1,
  f2.municipio AS cidade_2, f2.cargo AS cargo_2, f2.carga_horaria AS horas_2,
  (f1.carga_horaria + f2.carga_horaria) AS total_horas,
  ROUND(f1.salario_bruto + f2.salario_bruto, 2) AS renda_total,
  CASE
    WHEN f1.uf != f2.uf                                    THEN '🔴 ACÚMULO EM ESTADOS DIFERENTES'
    WHEN (f1.carga_horaria + f2.carga_horaria) > 70        THEN '🔴 CARGA >70H SEMANAIS'
    ELSE '🟠 ACÚMULO SUSPEITO'
  END AS alerta
FROM `fiscalizapa.folha_pagamento` f1
JOIN `fiscalizapa.folha_pagamento` f2
  ON f1.cpf = f2.cpf AND f1.municipio != f2.municipio
WHERE (f1.carga_horaria + f2.carga_horaria) > 60 OR f1.uf != f2.uf;
"""

SQL_SETUP_SERVIDOR_BOLSA = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_servidor_bolsa_familia` AS
SELECT f.nome_servidor, f.cpf, f.cargo, f.municipio,
  ROUND(f.salario_bruto, 2) AS salario,
  bf.valorParcela AS valor_bf,
  '🔴 SERVIDOR PÚBLICO RECEBENDO BOLSA FAMÍLIA' AS alerta
FROM `fiscalizapa.folha_pagamento` f
JOIN `fiscalizapa.bolsa_familia` bf ON f.cpf = bf.cpf
WHERE f.salario_bruto > 3000
ORDER BY f.salario_bruto DESC;
"""

SQL_SETUP_SERVIDOR_BPC = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_servidor_bpc` AS
SELECT f.nome_servidor, f.cpf, f.cargo, f.municipio,
  ROUND(f.salario_bruto, 2) AS salario,
  b.tipo_beneficio, ROUND(b.valor, 2) AS valor_bpc,
  '🔴 SERVIDOR RECEBENDO BPC (BENEFÍCIO PARA QUEM NÃO PODE TRABALHAR)' AS alerta
FROM `fiscalizapa.folha_pagamento` f
JOIN `fiscalizapa.bpc_beneficiarios` b ON f.cpf = b.cpf
ORDER BY f.salario_bruto DESC;
"""

SQL_SETUP_SERVIDOR_DEFESO = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_servidor_seguro_defeso` AS
SELECT f.nome_servidor, f.cpf, f.cargo, f.municipio,
  ROUND(f.salario_bruto, 2) AS salario,
  sd.valor AS valor_defeso,
  '🔴 SERVIDOR RECEBENDO SEGURO DEFESO (EXCLUSIVO PARA PESCADORES)' AS alerta
FROM `fiscalizapa.folha_pagamento` f
JOIN `fiscalizapa.seguro_defeso` sd ON f.cpf = sd.cpf
ORDER BY f.salario_bruto DESC;
"""

SQL_SETUP_DOADOR_DIARIO = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_diario_vs_doador` AS
SELECT d.municipio, d.data_publicacao, d.excerto,
  t.nome_doador, ROUND(t.valor_doado, 2) AS valor_doado,
  t.candidato_apoiado,
  '🔴 NOME DE DOADOR DE CAMPANHA ENCONTRADO NO DIÁRIO OFICIAL' AS alerta
FROM `fiscalizapa.diarios_oficiais` d
JOIN `fiscalizapa.tse_doacoes` t
  ON UPPER(d.excerto) LIKE CONCAT('%', UPPER(t.nome_doador), '%')
  AND d.id_municipio = t.municipio;
"""

SQL_SETUP_ENRIQUECIMENTO = """
CREATE OR REPLACE VIEW `fiscalizapa.forense_enriquecimento` AS
WITH por_eleicao AS (
  SELECT cpf, nome, ano_eleicao, SUM(valor_bem) AS patrimonio
  FROM `fiscalizapa.patrimonio_declarado`
  GROUP BY 1, 2, 3
),
evolucao AS (
  SELECT a.cpf, a.nome,
    a.ano_eleicao AS eleicao_anterior, a.patrimonio AS patrimonio_antes,
    b.ano_eleicao AS eleicao_atual,    b.patrimonio AS patrimonio_depois,
    ROUND(b.patrimonio - a.patrimonio, 2) AS crescimento,
    ROUND((b.patrimonio / NULLIF(a.patrimonio, 0) - 1) * 100, 1) AS pct_crescimento
  FROM por_eleicao a
  JOIN por_eleicao b ON a.cpf = b.cpf AND b.ano_eleicao > a.ano_eleicao
)
SELECT *,
  CASE
    WHEN pct_crescimento > 500            THEN '🔴 ENRIQUECIMENTO >500% ENTRE ELEIÇÕES'
    WHEN pct_crescimento > 200            THEN '🟠 CRESCIMENTO PATRIMONIAL >200%'
    WHEN crescimento     > 5000000        THEN '🔴 CRESCEU >R$5M EM UM MANDATO'
    ELSE '🟡 MONITORAR'
  END AS alerta
FROM evolucao
ORDER BY crescimento DESC;
"""

# ─── Catálogo completo ────────────────────────────────────────────────────────
VIEWS: list[dict] = [
    # ── Guia-mestre v2 (Módulos 10-15) ──────────────────────────────────────
    {"id": "mod10_elegibilidade",         "name": "fiscalizapa.forense_elegibilidade_parlamentar",  "sql": SQL_MOD10_ELEGIBILIDADE},
    {"id": "mod11_inelegibilidade_reflexa","name": "fiscalizapa.forense_inelegibilidade_reflexa",   "sql": SQL_MOD11_INELEGIBILIDADE_REFLEXA},
    {"id": "mod12_educacao_fantasma",     "name": "fiscalizapa.forense_educacao_fantasma",          "sql": SQL_MOD12_EDUCACAO_FANTASMA},
    {"id": "mod13_emenda_vs_violencia",   "name": "fiscalizapa.forense_emenda_vs_violencia",        "sql": SQL_MOD13_EMENDA_VS_VIOLENCIA},
    {"id": "mod14_rpps_fundo_podre",      "name": "fiscalizapa.forense_rpps_fundo_podre",           "sql": SQL_MOD14_RPPS_FUNDO_PODRE},
    {"id": "mod15_osint_triangulacao",    "name": "fiscalizapa.forense_osint_triangulacao",         "sql": SQL_MOD15_OSINT_TRIANGULACAO},
    # ── setup.sh (Módulos 1-20) ──────────────────────────────────────────────
    {"id": "s01_cnae_incompativel",       "name": "fiscalizapa.forense_cnae_incompativel",          "sql": SQL_SETUP_CNAE_INCOMPATIVEL},
    {"id": "s02_empresa_recem_nascida",   "name": "fiscalizapa.forense_empresa_recem_nascida",      "sql": SQL_SETUP_EMPRESA_RECEM_NASCIDA},
    {"id": "s03_fracionamento",           "name": "fiscalizapa.forense_fracionamento_despesas",     "sql": SQL_SETUP_FRACIONAMENTO},
    {"id": "s04_fornecedor_punido",       "name": "fiscalizapa.forense_fornecedor_punido",          "sql": SQL_SETUP_FORNECEDOR_PUNIDO},
    {"id": "s05_pao_e_circo",             "name": "fiscalizapa.forense_pao_e_circo_arenas",         "sql": SQL_SETUP_PAO_E_CIRCO},
    {"id": "s06_obras_idh_queda",         "name": "fiscalizapa.forense_gastos_vs_idh_decrescente",  "sql": SQL_SETUP_OBRAS_IDH_QUEDA},
    {"id": "s07_saude_fantasma",          "name": "fiscalizapa.forense_saude_fantasma",             "sql": SQL_SETUP_SAUDE_FANTASMA},
    {"id": "s08_saude_vs_mortalidade",    "name": "fiscalizapa.forense_emenda_saude_vs_mortalidade","sql": SQL_SETUP_SAUDE_VS_MORTALIDADE},
    {"id": "s09_doador_vencedor",         "name": "fiscalizapa.forense_doador_vencedor",            "sql": SQL_SETUP_DOADOR_VENCEDOR},
    {"id": "s10_monopolio_partidario",    "name": "fiscalizapa.forense_monopolio_partidario",       "sql": SQL_SETUP_MONOPOLIO_PARTIDARIO},
    {"id": "s11_cartel_socios",           "name": "fiscalizapa.forense_cartel_socios",              "sql": SQL_SETUP_CARTEL_SOCIOS},
    {"id": "s12_distancia_geografica",    "name": "fiscalizapa.forense_distancia_fantasma",         "sql": SQL_SETUP_DISTANCIA_GEOGRAFICA},
    {"id": "s13_sobrepreco",              "name": "fiscalizapa.forense_sobrepreco_medicamentos",    "sql": SQL_SETUP_SOBREPRECO},
    {"id": "s14_pagamento_mortos",        "name": "fiscalizapa.forense_pagamento_mortos",           "sql": SQL_SETUP_PAGAMENTO_MORTOS},
    {"id": "s15_acumulo_cargos",          "name": "fiscalizapa.forense_acumulo_cargos",             "sql": SQL_SETUP_ACUMULO_CARGOS},
    {"id": "s16_servidor_bolsa",          "name": "fiscalizapa.forense_servidor_bolsa_familia",     "sql": SQL_SETUP_SERVIDOR_BOLSA},
    {"id": "s17_servidor_bpc",            "name": "fiscalizapa.forense_servidor_bpc",               "sql": SQL_SETUP_SERVIDOR_BPC},
    {"id": "s18_servidor_defeso",         "name": "fiscalizapa.forense_servidor_seguro_defeso",     "sql": SQL_SETUP_SERVIDOR_DEFESO},
    {"id": "s19_doador_diario",           "name": "fiscalizapa.forense_diario_vs_doador",           "sql": SQL_SETUP_DOADOR_DIARIO},
    {"id": "s20_enriquecimento",          "name": "fiscalizapa.forense_enriquecimento",             "sql": SQL_SETUP_ENRIQUECIMENTO},
]

_GROUPS = {
    "ficha_limpa":   ["mod10_elegibilidade", "mod11_inelegibilidade_reflexa"],
    "guia_mestre":   [v["id"] for v in VIEWS if v["id"].startswith("mod")],
    "setup":         [v["id"] for v in VIEWS if v["id"].startswith("s")],
    "all":           [v["id"] for v in VIEWS],
}


# ─── Executor ────────────────────────────────────────────────────────────────
def get_client(project_id: str | None) -> bigquery.Client:
    pid = project_id or os.environ.get(_ENV_PROJECT) or DEFAULT_BQ_PROJECT
    return bigquery.Client(project=pid)


def apply_view(client: bigquery.Client, view: dict) -> bool:
    print(f"\n{'─' * 60}")
    print(f"[{view['id']}] {view['name']} ...")
    try:
        job = client.query(view["sql"])
        job.result()
        print(f"  ✓ OK")
        return True
    except GoogleCloudError as exc:
        print(f"  ✗ BigQuery error [{view['id']}]: {exc}", file=sys.stderr)
        return False
    except Exception as exc:  # noqa: BLE001
        print(f"  ✗ Unexpected error [{view['id']}]: {exc}", file=sys.stderr)
        return False


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Cria/atualiza views forenses do A.S.M.O.D.E.U.S. no BigQuery."
    )
    p.add_argument(
        "--project",
        default=None,
        help=f"Projeto GCP (default: {_ENV_PROJECT} env ou {DEFAULT_BQ_PROJECT}).",
    )
    p.add_argument(
        "--only",
        default=None,
        help=(
            "ID de uma view específica (ex: mod10_elegibilidade) "
            "ou grupo: ficha_limpa | guia_mestre | setup | all."
        ),
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Imprime os SQLs sem executar no BigQuery.",
    )
    p.add_argument(
        "--list",
        action="store_true",
        help="Lista todos os IDs disponíveis e sai.",
    )
    args = p.parse_args(argv)

    if args.list:
        print(f"{'ID':<40} VIEW")
        print(f"{'─'*40} {'─'*50}")
        for v in VIEWS:
            print(f"{v['id']:<40} {v['name']}")
        return 0

    # Resolve grupo ou id individual
    if args.only is None or args.only == "all":
        targets = VIEWS
    elif args.only in _GROUPS:
        ids = set(_GROUPS[args.only])
        targets = [v for v in VIEWS if v["id"] in ids]
    else:
        targets = [v for v in VIEWS if v["id"] == args.only]

    if not targets:
        print(f"Nenhuma view corresponde a --only={args.only!r}.", file=sys.stderr)
        return 1

    if args.dry_run:
        for v in targets:
            print(f"\n{'=' * 60}\n-- {v['name']}")
            print(v["sql"])
        return 0

    client = get_client(args.project)
    ok = fail = 0
    for v in targets:
        if apply_view(client, v):
            ok += 1
        else:
            fail += 1

    print(f"\n{'─' * 60}")
    print(f"Resultado: {ok} view(s) OK, {fail} falha(s). Total: {ok + fail}.")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
