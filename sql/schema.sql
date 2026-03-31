-- FiscalizaPA / TransparenciaBR
-- Schema PostgreSQL Normalizado
-- Fase 2.1 - Modelagem DER
-- 2026-03-31

-- ==========================================
-- POLITICOS (tabela mestre)
-- ==========================================
CREATE TABLE IF NOT EXISTS politicos (
  id_politico     INTEGER PRIMARY KEY,
  casa            VARCHAR(20) NOT NULL DEFAULT 'CAMARA', -- CAMARA, SENADO, ASSEMBLEIA
  nome            VARCHAR(200) NOT NULL,
  nome_urna       VARCHAR(200),
  partido         VARCHAR(30),
  uf              VARCHAR(2),
  cargo           VARCHAR(50) DEFAULT 'Deputado Federal',
  foto_url        TEXT,
  email           VARCHAR(200),
  id_legislatura  INTEGER DEFAULT 57,
  situacao        VARCHAR(30) DEFAULT 'Exercicio',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_politicos_uf ON politicos(uf);
CREATE INDEX idx_politicos_partido ON politicos(partido);
CREATE INDEX idx_politicos_casa ON politicos(casa);

-- ==========================================
-- GASTOS_CEAP (Cota Parlamentar)
-- ==========================================
CREATE TABLE IF NOT EXISTS gastos_ceap (
  id              BIGSERIAL PRIMARY KEY,
  politico_id     INTEGER NOT NULL REFERENCES politicos(id_politico),
  ano             SMALLINT NOT NULL,
  mes             SMALLINT,
  tipo_despesa    VARCHAR(200),
  fornecedor_nome VARCHAR(300),
  cnpj_cpf        VARCHAR(20),
  valor_documento NUMERIC(14,2) DEFAULT 0,
  valor_liquido   NUMERIC(14,2) DEFAULT 0,
  url_documento   TEXT,
  data_documento  DATE,
  num_documento   VARCHAR(50),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(politico_id, ano, mes, cnpj_cpf, valor_liquido)
);
CREATE INDEX idx_gastos_politico ON gastos_ceap(politico_id);
CREATE INDEX idx_gastos_ano ON gastos_ceap(ano);
CREATE INDEX idx_gastos_fornecedor ON gastos_ceap(fornecedor_nome);
CREATE INDEX idx_gastos_cnpj ON gastos_ceap(cnpj_cpf);
CREATE INDEX idx_gastos_tipo ON gastos_ceap(tipo_despesa);

-- ==========================================
-- FORNECEDORES (normalizado)
-- ==========================================
CREATE TABLE IF NOT EXISTS fornecedores (
  id              BIGSERIAL PRIMARY KEY,
  cnpj_cpf        VARCHAR(20) UNIQUE NOT NULL,
  nome            VARCHAR(300),
  total_recebido  NUMERIC(14,2) DEFAULT 0,
  num_politicos   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_fornecedores_cnpj ON fornecedores(cnpj_cpf);

-- ==========================================
-- EMENDAS PARLAMENTARES
-- ==========================================
CREATE TABLE IF NOT EXISTS emendas (
  id              BIGSERIAL PRIMARY KEY,
  codigo_emenda   VARCHAR(50) UNIQUE,
  politico_id     INTEGER REFERENCES politicos(id_politico),
  autor_nome      VARCHAR(200),
  autor_partido   VARCHAR(30),
  autor_uf        VARCHAR(2),
  ano             SMALLINT,
  tipo_emenda     VARCHAR(100),
  localidade      VARCHAR(200),
  uf_destino      VARCHAR(2),
  funcao          VARCHAR(100),
  subfuncao       VARCHAR(100),
  programa        VARCHAR(200),
  valor_empenhado NUMERIC(14,2) DEFAULT 0,
  valor_liquidado NUMERIC(14,2) DEFAULT 0,
  valor_pago      NUMERIC(14,2) DEFAULT 0,
  taxa_execucao   SMALLINT DEFAULT 0,
  criticidade     VARCHAR(10) DEFAULT 'BAIXA',
  alertas         TEXT[],
  idh_local       NUMERIC(5,3),
  is_show         BOOLEAN DEFAULT FALSE,
  beneficiario    VARCHAR(300),
  cnpj_recebedor  VARCHAR(20),
  nome_recebedor  VARCHAR(300),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_emendas_politico ON emendas(politico_id);
CREATE INDEX idx_emendas_ano ON emendas(ano);
CREATE INDEX idx_emendas_uf ON emendas(uf_destino);
CREATE INDEX idx_emendas_tipo ON emendas(tipo_emenda);
CREATE INDEX idx_emendas_criticidade ON emendas(criticidade);

-- ==========================================
-- SESSOES / PRESENCA PLENARIO
-- ==========================================
CREATE TABLE IF NOT EXISTS sessoes_plenario (
  id              BIGSERIAL PRIMARY KEY,
  politico_id     INTEGER NOT NULL REFERENCES politicos(id_politico),
  data_sessao     DATE,
  tipo_sessao     VARCHAR(50),
  ano             SMALLINT,
  presente        BOOLEAN DEFAULT FALSE,
  justificativa   VARCHAR(200),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(politico_id, data_sessao, tipo_sessao)
);
CREATE INDEX idx_sessoes_politico ON sessoes_plenario(politico_id);
CREATE INDEX idx_sessoes_ano ON sessoes_plenario(ano);

-- ==========================================
-- VERBAS DE GABINETE
-- ==========================================
CREATE TABLE IF NOT EXISTS verbas_gabinete (
  id              BIGSERIAL PRIMARY KEY,
  politico_id     INTEGER NOT NULL REFERENCES politicos(id_politico),
  ano             SMALLINT,
  mes             SMALLINT,
  valor_disponivel NUMERIC(14,2) DEFAULT 0,
  valor_gasto     NUMERIC(14,2) DEFAULT 0,
  economia        NUMERIC(14,2) DEFAULT 0,
  pct_utilizado   NUMERIC(5,1) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(politico_id, ano, mes)
);
CREATE INDEX idx_verbas_politico ON verbas_gabinete(politico_id);

-- ==========================================
-- PESSOAL DE GABINETE
-- ==========================================
CREATE TABLE IF NOT EXISTS pessoal_gabinete (
  id              BIGSERIAL PRIMARY KEY,
  politico_id     INTEGER NOT NULL REFERENCES politicos(id_politico),
  nome            VARCHAR(200),
  grupo_funcional VARCHAR(100),
  cargo           VARCHAR(100),
  periodo         VARCHAR(100),
  ano             SMALLINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pessoal_politico ON pessoal_gabinete(politico_id);

-- ==========================================
-- ALERTAS DE FRETAMENTO
-- ==========================================
CREATE TABLE IF NOT EXISTS alertas_fretamento (
  id              BIGSERIAL PRIMARY KEY,
  politico_id     INTEGER NOT NULL REFERENCES politicos(id_politico),
  tipo            VARCHAR(50),
  gravidade       VARCHAR(10),
  despesa_id      VARCHAR(100),
  data            DATE,
  valor           NUMERIC(14,2),
  fornecedor      VARCHAR(300),
  cnpj            VARCHAR(20),
  descricao       TEXT,
  detalhes        JSONB,
  url_documento   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_alertas_politico ON alertas_fretamento(politico_id);
CREATE INDEX idx_alertas_gravidade ON alertas_fretamento(gravidade);

-- ==========================================
-- SCORES E INDICES
-- ==========================================
CREATE TABLE IF NOT EXISTS scores (
  id              BIGSERIAL PRIMARY KEY,
  politico_id     INTEGER NOT NULL REFERENCES politicos(id_politico) UNIQUE,
  score_final     NUMERIC(5,1),
  classificacao   VARCHAR(30),
  eixo1_presenca  NUMERIC(5,1),
  eixo2_protagonismo NUMERIC(5,1),
  eixo3_producao  NUMERIC(5,1),
  eixo4_fiscalizacao NUMERIC(5,1),
  eixo5_posicionamento NUMERIC(5,1),
  eixo6_eficiencia NUMERIC(5,1),
  ranking_economia INTEGER,
  percentil       INTEGER,
  total_gastos    NUMERIC(14,2) DEFAULT 0,
  total_emendas   NUMERIC(14,2) DEFAULT 0,
  num_gastos      INTEGER DEFAULT 0,
  presenca_pct    NUMERIC(5,1) DEFAULT 0,
  concentracao_top3 NUMERIC(5,1) DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_scores_ranking ON scores(ranking_economia);
CREATE INDEX idx_scores_final ON scores(score_final DESC);

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
ORDER BY total_valor DESC;
