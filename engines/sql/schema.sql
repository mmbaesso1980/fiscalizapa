-- FiscalizaPA / TransparenciaBR
-- Schema PostgreSQL Normalizado
-- Fase 2.1 - Modelagem DER
-- 2026-03-31

-- ==========================================
-- POLITICOS (tabela mestre)
-- ==========================================
CREATE TABLE IF NOT EXISTS politicos (
  id_politico     INT64,
  casa            STRING DEFAULT 'CAMARA', -- CAMARA, SENADO, ASSEMBLEIA
  nome            STRING NOT NULL,
  nome_urna       STRING,
  partido         STRING,
  uf              STRING,
  cargo           STRING DEFAULT 'Deputado Federal',
  foto_url        STRING,
  email           STRING,
  id_legislatura  INT64 DEFAULT 57,
  situacao        STRING DEFAULT 'Exercicio',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ==========================================
-- GASTOS_CEAP (Cota Parlamentar)
-- ==========================================
CREATE TABLE IF NOT EXISTS gastos_ceap (
  id              INT64,
  politico_id     INT64 NOT NULL,
  ano             INT64 NOT NULL,
  mes             INT64,
  tipo_despesa    STRING,
  fornecedor_nome STRING,
  cnpj_cpf        STRING,
  valor_documento NUMERIC DEFAULT 0,
  valor_liquido   NUMERIC DEFAULT 0,
  url_documento   STRING,
  data_documento  DATE,
  num_documento   STRING,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ==========================================
-- FORNECEDORES (normalizado)
-- ==========================================
CREATE TABLE IF NOT EXISTS fornecedores (
  id              INT64,
  cnpj_cpf        STRING NOT NULL,
  nome            STRING,
  total_recebido  NUMERIC DEFAULT 0,
  num_politicos   INT64 DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ==========================================
-- EMENDAS PARLAMENTARES
-- ==========================================
CREATE TABLE IF NOT EXISTS emendas (
  id              INT64,
  codigo_emenda   STRING,
  politico_id     INT64,
  autor_nome      STRING,
  autor_partido   STRING,
  autor_uf        STRING,
  ano             INT64,
  tipo_emenda     STRING,
  localidade      STRING,
  uf_destino      STRING,
  funcao          STRING,
  subfuncao       STRING,
  programa        STRING,
  valor_empenhado NUMERIC DEFAULT 0,
  valor_liquidado NUMERIC DEFAULT 0,
  valor_pago      NUMERIC DEFAULT 0,
  taxa_execucao   INT64 DEFAULT 0,
  criticidade     STRING DEFAULT 'BAIXA',
  alertas         ARRAY<STRING>,
  idh_local       NUMERIC,
  is_show         BOOL DEFAULT FALSE,
  beneficiario    STRING,
  cnpj_recebedor  STRING,
  nome_recebedor  STRING,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ==========================================
-- SESSOES / PRESENCA PLENARIO
-- ==========================================
CREATE TABLE IF NOT EXISTS sessoes_plenario (
  id              INT64,
  politico_id     INT64 NOT NULL,
  data_sessao     DATE,
  tipo_sessao     STRING,
  ano             INT64,
  presente        BOOL DEFAULT FALSE,
  justificativa   STRING,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ==========================================
-- VERBAS DE GABINETE
-- ==========================================
CREATE TABLE IF NOT EXISTS verbas_gabinete (
  id              INT64,
  politico_id     INT64 NOT NULL,
  ano             INT64,
  mes             INT64,
  valor_disponivel NUMERIC DEFAULT 0,
  valor_gasto     NUMERIC DEFAULT 0,
  economia        NUMERIC DEFAULT 0,
  pct_utilizado   NUMERIC DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ==========================================
-- PESSOAL DE GABINETE
-- ==========================================
CREATE TABLE IF NOT EXISTS pessoal_gabinete (
  id              INT64,
  politico_id     INT64 NOT NULL,
  nome            STRING,
  grupo_funcional STRING,
  cargo           STRING,
  periodo         STRING,
  ano             INT64,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ==========================================
-- ALERTAS DE FRETAMENTO
-- ==========================================
CREATE TABLE IF NOT EXISTS alertas_fretamento (
  id              INT64,
  politico_id     INT64 NOT NULL,
  tipo            STRING,
  gravidade       STRING,
  despesa_id      STRING,
  data            DATE,
  valor           NUMERIC,
  fornecedor      STRING,
  cnpj            STRING,
  descricao       STRING,
  detalhes        JSON,
  url_documento   STRING,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ==========================================
-- SCORES E INDICES
-- ==========================================
CREATE TABLE IF NOT EXISTS scores (
  id              INT64,
  politico_id     INT64 NOT NULL,
  score_final     NUMERIC,
  classificacao   STRING,
  eixo1_presenca  NUMERIC,
  eixo2_protagonismo NUMERIC,
  eixo3_producao  NUMERIC,
  eixo4_fiscalizacao NUMERIC,
  eixo5_posicionamento NUMERIC,
  eixo6_eficiencia NUMERIC,
  ranking_economia INT64,
  percentil       INT64,
  total_gastos    NUMERIC DEFAULT 0,
  total_emendas   NUMERIC DEFAULT 0,
  num_gastos      INT64 DEFAULT 0,
  presenca_pct    NUMERIC DEFAULT 0,
  concentracao_top3 NUMERIC DEFAULT 0,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ==========================================
-- VIEWS UTEIS
-- ==========================================
CREATE OR REPLACE VIEW v_politico_resumo AS
SELECT
  p.id_politico,
  p.nome,
  p.partido,
  p.uf,
  p.cargo,
  p.foto_url,
  s.score_final,
  s.classificacao,
  s.ranking_economia,
  s.percentil,
  s.total_gastos,
  s.num_gastos,
  s.presenca_pct,
  s.concentracao_top3,
  (SELECT COUNT(*) FROM emendas e WHERE e.politico_id = p.id_politico) AS total_emendas,
  (SELECT COUNT(*) FROM alertas_fretamento a WHERE a.politico_id = p.id_politico) AS total_alertas
FROM politicos p
LEFT JOIN scores s ON s.politico_id = p.id_politico
WHERE p.casa = 'CAMARA';

CREATE OR REPLACE VIEW v_top_fornecedores AS
SELECT
  g.politico_id,
  g.fornecedor_nome,
  g.cnpj_cpf,
  SUM(g.valor_liquido) AS total_valor,
  COUNT(*) AS num_notas
FROM gastos_ceap g
GROUP BY g.politico_id, g.fornecedor_nome, g.cnpj_cpf
ORDER BY total_valor DESC;

CREATE OR REPLACE VIEW v_gastos_por_tipo AS
SELECT
  g.politico_id,
  g.tipo_despesa,
  SUM(g.valor_liquido) AS total_valor,
  COUNT(*) AS num_notas
FROM gastos_ceap g
GROUP BY g.politico_id, g.tipo_despesa

  -- ==========================================
-- EMENDAS DOCUMENTOS DE DESPESA (encaminhamento)
-- Fase 2.2 - Rastreamento do caminho da emenda
-- ==========================================
CREATE TABLE IF NOT EXISTS emendas_documentos (
    id                  INT64,
    codigo_emenda       STRING NOT NULL,
    ano_emenda          INT64,
    codigo_autor        STRING,
    nome_autor          STRING,
    numero_emenda       STRING,
    tipo_emenda         STRING,
    fase_despesa        STRING NOT NULL, -- EMPENHO, LIQUIDACAO, PAGAMENTO
    data_documento      DATE,
    codigo_documento    STRING,
    valor_empenhado     NUMERIC DEFAULT 0,
    valor_pago          NUMERIC DEFAULT 0,
    codigo_favorecido   STRING,
    nome_favorecido     STRING,
    tipo_favorecido     STRING,
    uf_favorecido       STRING,
    municipio_favorecido STRING,
    localidade_aplicacao STRING,
    uf_aplicacao        STRING,
    municipio_aplicacao STRING,
    codigo_ibge_municipio STRING,
    codigo_ug           STRING,
    nome_ug             STRING,
    codigo_orgao        STRING,
    nome_orgao          STRING,
    codigo_orgao_superior STRING,
    nome_orgao_superior STRING,
    codigo_funcao       STRING,
    nome_funcao         STRING,
    codigo_subfuncao    STRING,
    nome_subfuncao      STRING,
    codigo_programa     STRING,
    nome_programa       STRING,
    codigo_acao         STRING,
    nome_acao           STRING,
    grupo_despesa       STRING,
    elemento_despesa    STRING,
    modalidade_aplicacao STRING,
    possui_convenio     BOOL DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ==========================================
-- EMENDAS CONVENIOS (vinculo emenda-convenio)
-- ==========================================
CREATE TABLE IF NOT EXISTS emendas_convenios (
    id                  INT64,
    codigo_emenda       STRING NOT NULL,
    numero_convenio     STRING,
    convenente          STRING,
    objeto_convenio     STRING,
    valor_convenio      NUMERIC DEFAULT 0,
    data_publicacao     DATE,
    codigo_funcao       STRING,
    nome_funcao         STRING,
    nome_subfuncao      STRING,
    localidade_gasto    STRING,
    tipo_emenda         STRING,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ==========================================
-- VIEW: Encaminhamento completo da emenda
-- ==========================================
CREATE OR REPLACE VIEW v_emenda_encaminhamento AS
SELECT
    ed.codigo_emenda,
    ed.ano_emenda,
    ed.nome_autor,
    ed.tipo_emenda,
    ed.fase_despesa,
    ed.data_documento,
    ed.valor_empenhado,
    ed.valor_pago,
    ed.nome_favorecido,
    ed.tipo_favorecido,
    ed.uf_aplicacao,
    ed.municipio_aplicacao,
    ed.nome_orgao,
    ed.nome_funcao,
    ed.grupo_despesa,
    ed.possui_convenio
FROM emendas_documentos ed
ORDER BY ed.codigo_emenda, ed.data_documento;

-- VIEW: Resumo por emenda (totais por fase)
CREATE OR REPLACE VIEW v_emenda_resumo_fases AS
SELECT
    codigo_emenda,
    nome_autor,
    tipo_emenda,
    ano_emenda,
    SUM(CASE WHEN fase_despesa = 'Empenho' THEN valor_empenhado ELSE 0 END) AS total_empenhado,
    SUM(CASE WHEN fase_despesa = 'Pagamento' THEN valor_pago ELSE 0 END) AS total_pago,
    COUNT(DISTINCT CASE WHEN fase_despesa = 'Empenho' THEN codigo_documento END) AS num_empenhos,
    COUNT(DISTINCT CASE WHEN fase_despesa = 'Liquidação' THEN codigo_documento END) AS num_liquidacoes,
    COUNT(DISTINCT CASE WHEN fase_despesa = 'Pagamento' THEN codigo_documento END) AS num_pagamentos,
    COUNT(DISTINCT nome_favorecido) AS num_favorecidos,
    MIN(data_documento) AS primeira_data,
    MAX(data_documento) AS ultima_data
FROM emendas_documentos
GROUP BY codigo_emenda, nome_autor, tipo_emenda, ano_emenda;

-- ==========================================
-- PROTOCOLO GÊNESE: Inteligência Forense (Asmodeus v2.0)
-- ==========================================

CREATE TABLE IF NOT EXISTS dim_processos_judiciais (
    id                INT64,
    id_relacional     STRING NOT NULL, -- CPF ou CNPJ
    tipo_ente         STRING NOT NULL, -- 'POLITICO' ou 'FORNECEDOR'
    data_consulta     TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
    total_processos   INT64 DEFAULT 0,
    risco_juridico    NUMERIC DEFAULT 0.00
);

CREATE TABLE IF NOT EXISTS fato_citacoes (
    id                INT64,
    id_processo       INT64,
    numero_processo   STRING,
    tribunal          STRING,
    data_citacao      DATE,
    tipo_citacao      STRING, -- 'Improbidade Administrativa', 'Peculato', etc
    fonte_dados       STRING, -- 'Datajud', 'Diário Oficial'
    resumo_ocorrencia STRING,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
