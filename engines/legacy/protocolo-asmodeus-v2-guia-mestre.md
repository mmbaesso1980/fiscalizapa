# PROTOCOLO A.S.M.O.D.E.U.S. — GUIA MESTRE v2.0
## Auditoria Sistêmica e Monitoramento Ostensivo de Desvios, Esquemas e Usurpações Sociopolíticas

---

# PARTE I — MOTOR DE ELEGIBILIDADE / FICHA LIMPA

O A.S.M.O.D.E.U.S. deve calcular automaticamente se cada parlamentar/prefeito pode se candidatar na próxima eleição. Abaixo, todas as 17 hipóteses de inelegibilidade da LC 64/1990 (atualizada pela LC 135/2010 — Ficha Limpa — e pela LC 219/2025), traduzidas em filtros programáticos.

## 1.1 Hipóteses de Inelegibilidade — Art. 1º, Inciso I (Qualquer Cargo)

| Alínea | Causa | Prazo | Fonte de Dados para Cruzamento |
|--------|-------|-------|-------------------------------|
| **a** | Inalistáveis e analfabetos | Permanente | TSE — cadastro eleitoral |
| **b** | Perda de mandato legislativo (art. 55, I e II, CF) | 8 anos da decisão | TSE + Câmara/Senado — cassações |
| **c** | Governador/Prefeito que perdeu cargo por infração | 8 anos da decisão | TSE + TREs — cassações executivo |
| **d** | Abuso de poder econômico/político julgado procedente | 8 anos da eleição | Justiça Eleitoral — AIJE/AIME |
| **e.1** | Condenação: crimes contra economia popular, fé pública, administração e patrimônio público | 8 anos (desde condenação colegiada até 8 anos após cumprimento da pena para crimes administrativos) | Tribunais (TJ, TRF, STJ) — processos judiciais |
| **e.2** | Condenação: crimes contra patrimônio privado, sistema financeiro, mercado de capitais, falência | 8 anos | CVM + Tribunais |
| **e.3** | Condenação: crimes contra meio ambiente e saúde pública | 8 anos | IBAMA + Tribunais |
| **e.4** | Condenação: crimes eleitorais com pena privativa de liberdade | 8 anos | Justiça Eleitoral |
| **e.5** | Condenação: abuso de autoridade com perda de cargo | 8 anos | Tribunais |
| **e.6** | Condenação: lavagem de dinheiro | 8 anos | COAF + Tribunais |
| **e.7** | Condenação: tráfico, racismo, tortura, terrorismo, hediondos | 8 anos | Tribunais |
| **e.8** | Condenação: trabalho escravo | 8 anos | MTE "Lista Suja" + Tribunais |
| **e.9** | Condenação: crimes contra a vida e dignidade sexual | 8 anos | Tribunais |
| **e.10** | Condenação: organização criminosa | 8 anos | PF + Tribunais |
| **f** | Declarados indignos do oficialato militar | 8 anos | Forças Armadas |
| **g** | Contas rejeitadas por improbidade dolosa (TCE/TCU) — decisão irrecorrível | 8 anos da decisão | **TCE/TCU — contas julgadas** |
| **h** | Cargo público + abuso de poder econômico/político — condenação colegiada | 8 anos | Tribunais + TSE |
| **i** | Dirigente de instituição financeira em liquidação (12 meses antes) | Enquanto não exonerado | Bacen — liquidações |
| **j** | Corrupção eleitoral, compra de votos, gastos ilícitos de campanha | 8 anos da eleição | Justiça Eleitoral |
| **k** | Renúncia a mandato após oferecimento de representação/petição | 8 anos da renúncia | TSE + Câmara/Senado |
| **l** | Improbidade administrativa dolosa — suspensão de direitos políticos com lesão ao patrimônio E enriquecimento ilícito (cumulativo, LC 219/2025) | 8 anos (máximo acumulável: 12 anos, §8º) | Tribunais — ações de improbidade |
| **m** | Exclusão profissional por infração ético-profissional | 8 anos | Conselhos profissionais (OAB, CRM, CREA) |
| **n** | Fraude em dissolução de vínculo conjugal para evitar inelegibilidade | 8 anos da decisão | Justiça Eleitoral |
| **o** | Demissão do serviço público por improbidade | 8 anos da decisão | CGU (CEAF/PAD) + Tribunais |
| **p** | Doação eleitoral ilegal — pessoa física ou dirigente de PJ | 8 anos da decisão | Justiça Eleitoral + TSE |
| **q** | Magistrado/MP aposentado compulsoriamente ou que perdeu cargo | 8 anos | CNJ + CNMP |

### Regras Especiais (LC 219/2025 — Novidades)

- **§4º-B**: Para as alíneas "g" e "l", dolo exige vontade livre e consciente com resultado ilícito nos arts. 9º e 10 da Lei 8.429/1992 cumulativamente.
- **§4º-D**: Fatos conexos geram inelegibilidade a partir da PRIMEIRA condenação colegiada — vedada dupla restrição.
- **§8º**: Acúmulo de inelegibilidades por improbidade limitado a 12 anos.
- **Art. 26-D**: Condições aferidas no momento do registro, mas alterações supervenientes até a diplomação são reconhecidas.

## 1.2 Inelegibilidade Reflexa (Parentesco)

| Regra | Quem é Atingido | Exceção |
|-------|-----------------|---------|
| **§3º, Art. 1º** | Cônjuge e parentes até 2º grau (consanguíneos, afins, adoção) do Presidente, Governador ou Prefeito | Se já titular de mandato e candidato à reeleição |
| **Território** | Aplica-se apenas no território de jurisdição do titular | - |

**Cruzamento A.S.M.O.D.E.U.S.**: CPF do parlamentar → base de parentesco (Receita Federal, cartórios, TSE declarações de bens conjugais) → verifica se parente ocupa Executivo na mesma circunscrição.

## 1.3 Desincompatibilização (Prazos para Deixar Cargo)

| Cargo Atual | Prazo para Sair | Para Concorrer a |
|-------------|-----------------|------------------|
| Presidente, Governador, Prefeito | 6 meses antes do pleito | Outro cargo |
| Vice (que substituiu titular nos últimos 6 meses) | 6 meses | Outro cargo |
| Ministros de Estado, Secretários, Comandantes militares | 6 meses | Presidente/Governador |
| Magistrados, membros do MP | 6 meses | Prefeito/Vereador no município de atuação |
| Autoridades policiais | 6 meses | Prefeito no município de exercício |
| Servidores públicos | 3 meses | Presidente (pela LC 219/2025) |
| Dirigentes de entidades de classe com contribuição compulsória | 6 meses | Qualquer cargo |
| Dirigentes de empresas com contrato público | 6 meses | Qualquer cargo |

---

# PARTE II — NOVAS TABELAS BIGQUERY (Elegibilidade + Educação + Criminalidade + OSINT)

## 2.1 Tabelas de Elegibilidade e Processos

```sql
-- PROCESSOS ELEITORAIS (AIJE, AIME, Representações)
CREATE TABLE IF NOT EXISTS fiscalizapa.processos_eleitorais (
  cpf STRING,
  nome STRING,
  numero_processo STRING,
  tribunal STRING,  -- TSE, TRE-PA, etc.
  tipo STRING,      -- AIJE, AIME, Representação, Recurso
  assunto STRING,
  situacao STRING,  -- Em andamento, Julgado procedente, Improcedente
  data_decisao STRING,
  resultado STRING, -- Procedente, Improcedente, Acordo
  pena_aplicada STRING,
  data_fim_inelegibilidade STRING
);

-- CONTAS JULGADAS (TCE/TCU)
CREATE TABLE IF NOT EXISTS fiscalizapa.contas_julgadas (
  cpf STRING,
  nome STRING,
  cargo STRING,
  municipio STRING,
  uf STRING,
  id_ibge STRING,
  exercicio INTEGER,
  tribunal STRING,         -- TCE-PA, TCU, etc.
  parecer STRING,          -- Regular, Irregular, Regular com Ressalva
  tipo_irregularidade STRING,
  valor_debito FLOAT64,
  data_julgamento STRING,
  transitou_em_julgado BOOLEAN,
  gera_inelegibilidade BOOLEAN
);

-- CASSAÇÕES E RENÚNCIAS
CREATE TABLE IF NOT EXISTS fiscalizapa.cassacoes_renuncias (
  cpf STRING,
  nome STRING,
  cargo STRING,
  casa_legislativa STRING,  -- Câmara, Senado, Assembleia, Câmara Municipal
  tipo STRING,              -- Cassação, Renúncia
  motivo STRING,
  data_evento STRING,
  houve_representacao_antes BOOLEAN,  -- Para alínea K (renúncia para fugir de processo)
  data_fim_inelegibilidade STRING
);

-- PARENTESCO POLÍTICO (para inelegibilidade reflexa §3º)
CREATE TABLE IF NOT EXISTS fiscalizapa.parentesco_politico (
  cpf_politico STRING,
  nome_politico STRING,
  cargo_politico STRING,
  municipio_jurisdicao STRING,
  cpf_parente STRING,
  nome_parente STRING,
  grau_parentesco STRING,  -- Cônjuge, 1º grau, 2º grau, Afim
  tipo_vinculo STRING      -- Consanguíneo, Afim, Adoção
);

-- LISTA SUJA (Trabalho Escravo - MTE)
CREATE TABLE IF NOT EXISTS fiscalizapa.lista_suja_trabalho_escravo (
  cnpj_cpf STRING,
  nome STRING,
  uf STRING,
  municipio STRING,
  data_inclusao STRING,
  data_fiscalizacao STRING,
  trabalhadores_envolvidos INTEGER
);

-- SANÇÕES CONSELHOS PROFISSIONAIS
CREATE TABLE IF NOT EXISTS fiscalizapa.sancoes_profissionais (
  cpf STRING,
  nome STRING,
  conselho STRING,  -- OAB, CRM, CREA, CRC
  tipo_sancao STRING,
  data_sancao STRING,
  prazo_anos INTEGER
);
```

## 2.2 Tabelas de Educação

```sql
-- IDEB POR MUNICÍPIO
CREATE TABLE IF NOT EXISTS fiscalizapa.ideb_municipios (
  id_municipio STRING,
  municipio STRING,
  uf STRING,
  ano INTEGER,
  rede STRING,          -- Municipal, Estadual
  etapa STRING,         -- Anos Iniciais, Anos Finais, Ensino Médio
  ideb_observado FLOAT64,
  ideb_meta FLOAT64,
  taxa_aprovacao FLOAT64,
  nota_saeb_matematica FLOAT64,
  nota_saeb_portugues FLOAT64
);

-- CENSO ESCOLAR (Infraestrutura)
CREATE TABLE IF NOT EXISTS fiscalizapa.censo_escolar (
  id_escola STRING,
  nome_escola STRING,
  id_municipio STRING,
  municipio STRING,
  uf STRING,
  rede STRING,
  tem_agua_potavel BOOLEAN,
  tem_esgoto BOOLEAN,
  tem_energia BOOLEAN,
  tem_internet BOOLEAN,
  tem_biblioteca BOOLEAN,
  tem_quadra BOOLEAN,
  tem_acessibilidade BOOLEAN,
  total_alunos INTEGER,
  total_docentes INTEGER,
  ano_censo INTEGER
);

-- REPASSES FNDE (Merenda e Transporte)
CREATE TABLE IF NOT EXISTS fiscalizapa.fnde_repasses (
  id_municipio STRING,
  municipio STRING,
  uf STRING,
  programa STRING,       -- PNAE, PNATE, PDDE, Salário-Educação
  ano INTEGER,
  valor_previsto FLOAT64,
  valor_repassado FLOAT64,
  valor_devolvido FLOAT64,
  alunos_beneficiados INTEGER
);

-- SICONFI (Gastos declarados em Educação pelo município)
CREATE TABLE IF NOT EXISTS fiscalizapa.siconfi_educacao (
  id_municipio STRING,
  municipio STRING,
  uf STRING,
  ano INTEGER,
  receita_mde FLOAT64,           -- Receita vinculada MDE (mínimo 25%)
  despesa_educacao FLOAT64,
  pct_aplicado_educacao FLOAT64, -- Se < 25%, irregularidade
  fundeb_recebido FLOAT64,
  fundeb_aplicado FLOAT64
);
```

## 2.3 Tabelas de Criminalidade e Segurança

```sql
-- OCORRÊNCIAS CRIMINAIS (Sinesp)
CREATE TABLE IF NOT EXISTS fiscalizapa.sinesp_ocorrencias (
  id_municipio STRING,
  municipio STRING,
  uf STRING,
  ano INTEGER,
  mes INTEGER,
  homicidios_dolosos INTEGER,
  latrocinios INTEGER,
  lesao_corporal_morte INTEGER,
  furtos INTEGER,
  roubos INTEGER,
  trafico_drogas INTEGER,
  apreensao_armas INTEGER,
  populacao_referencia INTEGER,
  taxa_homicidios_100k FLOAT64
);

-- FOGO CRUZADO (Violência Armada em Tempo Real)
CREATE TABLE IF NOT EXISTS fiscalizapa.fogo_cruzado (
  id_ocorrencia STRING,
  data_ocorrencia STRING,
  hora STRING,
  latitude FLOAT64,
  longitude FLOAT64,
  municipio STRING,
  uf STRING,
  bairro STRING,
  mortos INTEGER,
  feridos INTEGER,
  presenca_agentes_seguranca BOOLEAN,
  tipo_acao STRING  -- Operação policial, Disputa territorial, etc.
);

-- APREENSÕES (MJSP)
CREATE TABLE IF NOT EXISTS fiscalizapa.apreensoes_mjsp (
  municipio STRING,
  uf STRING,
  ano INTEGER,
  mes INTEGER,
  tipo STRING,  -- Drogas, Armas, Munição, Veículos
  quantidade FLOAT64,
  unidade STRING
);
```

## 2.4 Tabelas de OSINT e Monitoramento

```sql
-- GDELT (Eventos Globais — filtro Brasil)
CREATE TABLE IF NOT EXISTS fiscalizapa.gdelt_eventos (
  globalEventId STRING,
  data_evento STRING,
  tipo_evento STRING,    -- COERCE, PROTEST, APPEAL, etc.
  ator1 STRING,
  ator2 STRING,
  pais STRING,
  municipio_aprox STRING,
  tom_goldstein FLOAT64, -- Negativo = conflito
  num_mencoes INTEGER,
  url_fonte STRING,
  resumo STRING
);

-- NEWS CLIPS (NewsAPI + Google News)
CREATE TABLE IF NOT EXISTS fiscalizapa.news_clips (
  id_clip STRING,
  data_publicacao STRING,
  fonte STRING,
  titulo STRING,
  resumo STRING,
  url STRING,
  entidades_mencionadas STRING,   -- JSON array: políticos, empresas, municípios
  sentimento FLOAT64,             -- -1 a +1
  palavras_chave STRING,          -- JSON array
  municipio_relacionado STRING,
  uf STRING
);

-- MAPBIOMAS ALERTAS (Desmatamento)
CREATE TABLE IF NOT EXISTS fiscalizapa.mapbiomas_alertas (
  id_alerta STRING,
  data_deteccao STRING,
  municipio STRING,
  uf STRING,
  id_ibge STRING,
  area_desmatada_ha FLOAT64,
  bioma STRING,
  tem_autorizacao BOOLEAN,
  car_sobreposto STRING,  -- Cadastro Ambiental Rural
  latitude FLOAT64,
  longitude FLOAT64
);

-- COMEX STAT (Exportações atípicas)
CREATE TABLE IF NOT EXISTS fiscalizapa.comex_exportacoes (
  ano INTEGER,
  mes INTEGER,
  municipio STRING,
  uf STRING,
  ncm STRING,           -- Nomenclatura Comum do Mercosul
  descricao_produto STRING,
  pais_destino STRING,
  valor_fob_usd FLOAT64,
  peso_kg FLOAT64,
  via_transporte STRING  -- Marítima, Aérea, Rodoviária
);
```

## 2.5 Tabelas Financeiras (CVM, RPPS, PNCP)

```sql
-- FUNDOS CVM (Carteira de investimentos)
CREATE TABLE IF NOT EXISTS fiscalizapa.cvm_fundos (
  cnpj_fundo STRING,
  nome_fundo STRING,
  tipo_fundo STRING,      -- FIDC, FIP, FIM, FIA
  cnpj_gestor STRING,
  nome_gestor STRING,
  patrimonio_liquido FLOAT64,
  data_referencia STRING,
  qtd_cotistas INTEGER,
  rentabilidade_mes FLOAT64
);

-- RPPS INVESTIMENTOS (Fundos de Previdência Municipal)
CREATE TABLE IF NOT EXISTS fiscalizapa.rpps_investimentos (
  municipio STRING,
  uf STRING,
  id_ibge STRING,
  cnpj_rpps STRING,
  nome_rpps STRING,
  cnpj_fundo_investido STRING,
  nome_fundo_investido STRING,
  valor_investido FLOAT64,
  pct_patrimonio FLOAT64,
  data_referencia STRING,
  tipo_ativo STRING       -- Renda Fixa, FIDC, FIP, Ações
);

-- PNCP (Contratações Públicas — Nova Lei)
CREATE TABLE IF NOT EXISTS fiscalizapa.pncp_contratacoes (
  id_contratacao STRING,
  orgao STRING,
  municipio STRING,
  uf STRING,
  modalidade STRING,
  objeto STRING,
  valor_estimado FLOAT64,
  valor_homologado FLOAT64,
  cnpj_vencedor STRING,
  data_publicacao STRING,
  numero_participantes INTEGER,
  fonte STRING  -- PNCP
);

-- DOU EXTRATOS (Diário Oficial da União — Imprensa Nacional)
CREATE TABLE IF NOT EXISTS fiscalizapa.dou_extratos (
  id_publicacao STRING,
  secao STRING,          -- 1, 2, 3, Extra
  data_publicacao STRING,
  orgao STRING,
  tipo_ato STRING,       -- Portaria, Extrato de Contrato, Dispensa
  conteudo_texto STRING,
  cnpjs_extraidos STRING,   -- JSON array
  valores_extraidos STRING, -- JSON array
  termos_alerta STRING      -- FIDC, Debênture, Dispensa, etc.
);
```

---

# PARTE III — VIEWS FORENSES DE ELEGIBILIDADE (Módulos 10-15)

## Módulo 10: Calculadora Automática de Elegibilidade

```sql
CREATE OR REPLACE VIEW fiscalizapa.forense_elegibilidade_parlamentar AS
WITH ficha_limpa AS (
  -- Alínea D: Abuso de poder
  SELECT cpf, 'AIJE/AIME procedente — abuso de poder' AS causa,
    data_decisao, DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_decisao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM fiscalizapa.processos_eleitorais
  WHERE resultado = 'Procedente' AND tipo IN ('AIJE','AIME')

  UNION ALL

  -- Alínea E: Condenações criminais
  SELECT cpf, CONCAT('Condenação criminal: ', assunto) AS causa,
    data_decisao, DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_decisao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM fiscalizapa.processos_judiciais
  WHERE situacao = 'Condenado' AND (
    assunto LIKE '%administração pública%' OR assunto LIKE '%lavagem%'
    OR assunto LIKE '%tráfico%' OR assunto LIKE '%organização criminosa%'
    OR assunto LIKE '%patrimônio público%' OR assunto LIKE '%corrupção%'
    OR assunto LIKE '%peculato%' OR assunto LIKE '%improbidade%'
  )

  UNION ALL

  -- Alínea G: Contas rejeitadas TCE/TCU
  SELECT cpf, CONCAT('Contas rejeitadas ', tribunal, ' exercício ', CAST(exercicio AS STRING)) AS causa,
    data_julgamento, DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_julgamento), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM fiscalizapa.contas_julgadas
  WHERE parecer = 'Irregular' AND gera_inelegibilidade = TRUE AND transitou_em_julgado = TRUE

  UNION ALL

  -- Alínea J: Corrupção eleitoral
  SELECT cpf, 'Corrupção eleitoral / captação ilícita de sufrágio' AS causa,
    data_decisao, DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_decisao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM fiscalizapa.processos_eleitorais
  WHERE resultado = 'Procedente' AND tipo LIKE '%corrupção eleitoral%'

  UNION ALL

  -- Alínea K: Renúncia para fugir de processo
  SELECT cpf, 'Renúncia após representação — alínea K' AS causa,
    data_evento AS data_decisao, DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_evento), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM fiscalizapa.cassacoes_renuncias
  WHERE tipo = 'Renúncia' AND houve_representacao_antes = TRUE

  UNION ALL

  -- Alínea L: Improbidade com suspensão de direitos políticos
  SELECT cpf, 'Improbidade: lesão ao patrimônio + enriquecimento ilícito' AS causa,
    data_decisao, DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_decisao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM fiscalizapa.processos_judiciais
  WHERE assunto LIKE '%improbidade%' AND situacao = 'Condenado'

  UNION ALL

  -- Alínea O: Demissão por improbidade
  SELECT cpf, 'Demissão do serviço público por improbidade' AS causa,
    data_decisao, DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_decisao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM fiscalizapa.processos_judiciais
  WHERE assunto LIKE '%demissão%improbidade%'

  UNION ALL

  -- Lista Suja (Trabalho Escravo)
  SELECT cpf_cnpj AS cpf, 'Condenação por trabalho escravo — alínea e.8' AS causa,
    data_inclusao AS data_decisao, DATE_ADD(SAFE.PARSE_DATE('%Y-%m-%d', data_inclusao), INTERVAL 8 YEAR) AS fim_inelegibilidade
  FROM fiscalizapa.lista_suja_trabalho_escravo
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
LEFT JOIN fiscalizapa.tse_candidatos t ON fl.cpf = t.cpf
LEFT JOIN fiscalizapa.processos_judiciais p ON fl.cpf = p.cpf_cnpj
WHERE fl.fim_inelegibilidade > DATE_SUB(CURRENT_DATE(), INTERVAL 2 YEAR)
ORDER BY fl.fim_inelegibilidade DESC;
```

## Módulo 11: Inelegibilidade Reflexa (Parentesco)

```sql
CREATE OR REPLACE VIEW fiscalizapa.forense_inelegibilidade_reflexa AS
SELECT 
  pp.cpf_parente,
  pp.nome_parente,
  pp.grau_parentesco,
  pp.cpf_politico,
  pp.nome_politico AS titular_executivo,
  pp.cargo_politico,
  pp.municipio_jurisdicao,
  '🔴 INELEGÍVEL POR PARENTESCO (§3º Art.1º LC 64/90)' AS alerta
FROM fiscalizapa.parentesco_politico pp
WHERE pp.cargo_politico IN ('Prefeito','Governador','Presidente')
AND pp.grau_parentesco IN ('Cônjuge','1º grau','2º grau','Afim 1º grau','Afim 2º grau','Adoção');
```

## Módulo 12: Educação Fantasma (Dinheiro sem Resultado)

```sql
CREATE OR REPLACE VIEW fiscalizapa.forense_educacao_fantasma AS
SELECT
  f.municipio,
  f.programa,
  ROUND(SUM(f.valor_repassado), 2) AS total_repasses_fnde,
  s.pct_aplicado_educacao,
  i.ideb_observado,
  i.ideb_meta,
  ce.total_escolas_sem_agua,
  CASE
    WHEN s.pct_aplicado_educacao < 25 THEN '🔴 MUNICÍPIO APLICA <25% EM EDUCAÇÃO (INCONSTITUCIONAL)'
    WHEN i.ideb_observado < i.ideb_meta AND SUM(f.valor_repassado) > 5000000 THEN '🔴 MILHÕES RECEBIDOS MAS IDEB ABAIXO DA META'
    WHEN ce.total_escolas_sem_agua > 10 THEN '🟠 ESCOLAS SEM ÁGUA POTÁVEL'
    ELSE '🟡 MONITORAR'
  END AS alerta
FROM fiscalizapa.fnde_repasses f
LEFT JOIN fiscalizapa.siconfi_educacao s ON f.id_municipio = s.id_municipio AND f.ano = s.ano
LEFT JOIN fiscalizapa.ideb_municipios i ON f.id_municipio = i.id_municipio AND f.ano = i.ano AND i.etapa = 'Anos Iniciais'
LEFT JOIN (
  SELECT id_municipio, COUNT(*) AS total_escolas_sem_agua
  FROM fiscalizapa.censo_escolar WHERE tem_agua_potavel = FALSE
  GROUP BY 1
) ce ON f.id_municipio = ce.id_municipio
GROUP BY 1,2,s.pct_aplicado_educacao,i.ideb_observado,i.ideb_meta,ce.total_escolas_sem_agua
ORDER BY total_repasses_fnde DESC;
```

## Módulo 13: Correlação Emenda × Criminalidade

```sql
CREATE OR REPLACE VIEW fiscalizapa.forense_emenda_vs_violencia AS
SELECT
  e.municipio_destino,
  e.nomeDeputado,
  ROUND(SUM(e.valor_pago), 2) AS total_emendas_seguranca,
  s.homicidios_dolosos,
  s.taxa_homicidios_100k,
  LAG(s.taxa_homicidios_100k) OVER (PARTITION BY e.municipio_destino ORDER BY s.ano) AS taxa_ano_anterior,
  CASE
    WHEN s.taxa_homicidios_100k > 30 AND SUM(e.valor_pago) > 1000000 THEN '🔴 EMENDAS DE SEGURANÇA MAS HOMICÍDIOS >30/100K'
    WHEN s.taxa_homicidios_100k > LAG(s.taxa_homicidios_100k) OVER (PARTITION BY e.municipio_destino ORDER BY s.ano)
      AND SUM(e.valor_pago) > 500000 THEN '🟠 VIOLÊNCIA SUBINDO APESAR DAS EMENDAS'
    ELSE '🟡 MONITORAR'
  END AS alerta
FROM fiscalizapa.emendas_parlamentares e
LEFT JOIN fiscalizapa.sinesp_ocorrencias s ON e.id_ibge_destino = s.id_municipio AND e.ano = s.ano
WHERE UPPER(e.funcao) LIKE '%SEGURANÇA%'
GROUP BY 1,2,s.homicidios_dolosos,s.taxa_homicidios_100k,s.ano
ORDER BY total_emendas_seguranca DESC;
```

## Módulo 14: RPPS Podre (O Próximo "Caso Vorcaro")

```sql
CREATE OR REPLACE VIEW fiscalizapa.forense_rpps_fundo_podre AS
SELECT
  r.municipio,
  r.nome_rpps,
  r.nome_fundo_investido,
  r.cnpj_fundo_investido,
  ROUND(r.valor_investido, 2) AS valor_investido,
  ROUND(r.pct_patrimonio, 2) AS pct_patrimonio_rpps,
  f.tipo_fundo,
  f.nome_gestor,
  f.rentabilidade_mes,
  CASE
    WHEN f.tipo_fundo IN ('FIDC','FIP') AND r.pct_patrimonio > 15 THEN '🔴 >15% DO RPPS EM FUNDO DE ALTO RISCO'
    WHEN f.rentabilidade_mes < -5 THEN '🔴 FUNDO COM RENTABILIDADE NEGATIVA >5%'
    WHEN f.qtd_cotistas < 5 THEN '🟠 FUNDO COM <5 COTISTAS (POSSÍVEL VEÍCULO EXCLUSIVO)'
    ELSE '🟡 MONITORAR'
  END AS alerta
FROM fiscalizapa.rpps_investimentos r
JOIN fiscalizapa.cvm_fundos f ON r.cnpj_fundo_investido = f.cnpj_fundo
ORDER BY r.valor_investido DESC;
```

## Módulo 15: OSINT — Correlação Notícia × Contrato × Desmatamento

```sql
CREATE OR REPLACE VIEW fiscalizapa.forense_osint_triangulacao AS
SELECT
  n.municipio_relacionado AS municipio,
  n.titulo AS manchete,
  n.sentimento,
  n.data_publicacao,
  c.objeto_contrato,
  ROUND(c.valor, 2) AS valor_contrato,
  c.cnpj_vencedor,
  m.area_desmatada_ha,
  m.tem_autorizacao,
  CASE
    WHEN n.sentimento < -0.5 AND c.valor > 500000 THEN '🔴 NOTÍCIA NEGATIVA + CONTRATO ALTO NO MESMO MUNICÍPIO'
    WHEN m.area_desmatada_ha > 100 AND m.tem_autorizacao = FALSE THEN '🔴 DESMATAMENTO ILEGAL + CONTRATOS SUSPEITOS'
    ELSE '🟠 CORRELAÇÃO DETECTADA'
  END AS alerta
FROM fiscalizapa.news_clips n
LEFT JOIN fiscalizapa.contratos c ON n.municipio_relacionado = c.municipio
  AND ABS(DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d',n.data_publicacao), SAFE.PARSE_DATE('%Y-%m-%d',c.data_assinatura), DAY)) <= 90
LEFT JOIN fiscalizapa.mapbiomas_alertas m ON n.municipio_relacionado = m.municipio
  AND ABS(DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d',n.data_publicacao), SAFE.PARSE_DATE('%Y-%m-%d',m.data_deteccao), DAY)) <= 180
WHERE n.sentimento < -0.3 OR m.area_desmatada_ha > 50
ORDER BY n.sentimento ASC;
```

---

# PARTE IV — SCRIPTS DE INGESTÃO (Novas APIs)

## 4.1 API do INEP (IDEB)

```bash
# IDEB por município — download CSV direto
curl -L "https://download.inep.gov.br/educacao_basica/portal_ideb/planilhas_para_download/2023/divulgacao_anos_iniciais_municipios_2023.xlsx" \
  -o ideb_municipios.xlsx
# Converter para CSV e carregar no BigQuery
```

## 4.2 API Siconfi (Tesouro Nacional)

```python
import requests, csv, time

BASE = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt"

# Gastos com educação por município
def baixar_rreo(ano, periodo, uf):
    url = f"{BASE}/rreo?an_exercicio={ano}&nr_periodo={periodo}&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2008&id_ente={uf}"
    r = requests.get(url, timeout=30)
    return r.json().get("items", [])
```

## 4.3 API Fogo Cruzado

```python
import requests

# Requer cadastro: https://api.fogocruzado.org.br/register
BASE = "https://api.fogocruzado.org.br/api/v2"

def get_token(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    return r.json()["data"]["accessToken"]

def get_ocorrencias(token, state_id, date_from, date_to):
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE}/occurrences?stateId={state_id}&dateFrom={date_from}&dateTo={date_to}",
                     headers=headers)
    return r.json()["data"]
```

## 4.4 GDELT (BigQuery Público — GRATUITO)

```sql
-- GDELT está no BigQuery público! Basta fazer query direta.
-- Filtro: Brasil + tom negativo + eventos de corrupção/coerção
SELECT DATEADD, Actor1Name, Actor2Name, GoldsteinScale, NumMentions, SOURCEURL
FROM `gdelt-bq.full.events`
WHERE ActionGeo_CountryCode = 'BR'
  AND GoldsteinScale < -5
  AND (EventCode LIKE '14%' OR EventCode LIKE '17%' OR EventCode LIKE '18%')
  AND YEAR >= 2023
ORDER BY GoldsteinScale ASC
LIMIT 10000;
```

## 4.5 API Querido Diário — Busca Avançada

```python
import requests, json

BASE = "https://queridodiario.ok.org.br/api"

TERMOS_ALERTA = [
    "FIDC", "FIP", "debênture", "dispensa de licitação",
    "emergência", "inexigibilidade", "fretamento de aeronave",
    "Wesley Safadão", "show artístico", "regime próprio de previdência",
    "cessão onerosa", "alienação de imóvel"
]

def varrer_municipio(id_ibge, termos=TERMOS_ALERTA):
    resultados = []
    for termo in termos:
        r = requests.get(f"{BASE}/gazettes", params={
            "territory_ids": id_ibge,
            "querystring": termo,
            "size": 100,
            "sort_by": "relevance"
        }, timeout=30)
        data = r.json()
        for g in data.get("gazettes", []):
            resultados.append({
                "id_municipio": g["territory_id"],
                "municipio": g.get("territory_name",""),
                "data": g["date"],
                "url": g.get("url",""),
                "excerto": (g.get("excerpts",[""])[0])[:500],
                "termo": termo
            })
    return resultados
```

## 4.6 CVM — Composição de Carteira de Fundos

```python
import requests, zipfile, io, csv

# A CVM publica CSVs mensais com a composição dos fundos
def baixar_carteira_cvm(ano, mes):
    url = f"https://dados.cvm.gov.br/dados/FI/DOC/CDA/DADOS/cda_fi_{ano}{mes:02d}.zip"
    r = requests.get(url, timeout=60)
    z = zipfile.ZipFile(io.BytesIO(r.content))
    # Procurar o CSV de composição
    for name in z.namelist():
        if "cda_fi_BLC" in name:
            with z.open(name) as f:
                reader = csv.DictReader(io.TextIOWrapper(f, encoding='latin-1'), delimiter=';')
                return list(reader)
```

---

# PARTE V — FLUXO COMPLETO DO A.S.M.O.D.E.U.S.

```
┌──────────────────────────────────────────────────────────────────┐
│                    CAMADA 1: COLETA MASSIVA                      │
│                                                                  │
│  Câmara API  ──┐                                                 │
│  TCE APIs    ──┤                                                 │
│  CGU Portal  ──┤──▶ BigQuery (fiscalizapa dataset)               │
│  TSE Dados   ──┤       │                                         │
│  IBGE/INEP   ──┤       │                                         │
│  CVM/Bacen   ──┤       ▼                                         │
│  DATASUS     ──┤  ┌─────────────────────────────┐                │
│  Sinesp      ──┤  │  CAMADA 2: VIEWS FORENSES   │                │
│  GDELT (BQ)  ──┤  │                             │                │
│  Querido D.  ──┤  │  55+ views de cruzamento    │                │
│  NewsAPI     ──┤  │  Elegibilidade automática    │                │
│  MapBiomas   ──┤  │  Módulos 1-15               │                │
│  PNCP        ──┤  └──────────┬──────────────────┘                │
│  DOU/IN      ──┘             │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────┐            │
│  │         CAMADA 3: CLOUD FUNCTIONS                 │            │
│  │                                                    │            │
│  │  getAuditoriaPolitico() ──── Dossiê individual    │            │
│  │  getHeatmapMunicipio() ──── Mapa de calor Brasil  │            │
│  │  getElegibilidade()    ──── Ficha Limpa auto      │            │
│  │  getOSINT()            ──── Notícias + GDELT      │            │
│  │  getRPPSAlert()        ──── Fundos podres          │            │
│  └──────────────────────┬───────────────────────────┘            │
│                         │                                        │
│                         ▼                                        │
│  ┌──────────────────────────────────────────────────┐            │
│  │         CAMADA 4: FRONTEND REACT                  │            │
│  │                                                    │            │
│  │  🔓 GRÁTIS: Alertas, Scores, Red Flags            │            │
│  │  💰 CRÉDITOS: Dossiê completo, Grafos, PDFs       │            │
│  │  📊 HEATMAP: Brasil inteiro, 5.568 municípios     │            │
│  │  ⚖️ ELEGIBILIDADE: Automática por parlamentar     │            │
│  └──────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

---

# PARTE VI — TABELA DE CRÉDITOS (Monetização)

| Operação | Créditos | Custo Computacional |
|----------|----------|-------------------|
| Busca simples (TCE + Receita) | 5 | Baixo — query BQ |
| Varredura Diário Oficial (OCR + 100 páginas) | 50 | Alto — Querido Diário API |
| Grafo Societário CVM/Receita (laranjas) | 100 | Médio — múltiplas queries |
| Dossiê Completo (PDF com linha do tempo) | 200 | Alto — todas as fontes |
| Calculadora de Elegibilidade | 10 | Baixo — view BQ |
| OSINT Report (GDELT + NewsAPI + MapBiomas) | 150 | Alto — APIs externas |
| Heatmap Municipal (todos indicadores) | 25 | Médio — aggregation BQ |
| Monitoramento contínuo (alertas 24/7) | 500/mês | Alto — polling contínuo |

---

*Documento gerado pelo Protocolo A.S.M.O.D.E.U.S. v2.0 — Abril 2026*
*LC 64/1990 atualizada pela LC 135/2010 (Ficha Limpa) e LC 219/2025*
