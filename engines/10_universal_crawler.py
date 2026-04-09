"""
A.S.M.O.D.E.U.S. — Universal API Crawler  (10_universal_crawler.py)

Sistema nervoso central da ingestão em enxame. Lê o catálogo
`registry_apis.json` e executa todos os crawlers em paralelo via
`concurrent.futures.ThreadPoolExecutor`, cada um independente e
com circuit breakers individuais.

Arquitetura de classes:
  AsmodeusCrawler          ← Classe base abstrata
  ├── RSSCrawler            ← Feeds RSS/Atom (DOU, DOE, DOM)
  ├── JSONAPICrawler        ← REST JSON com paginação automática
  └── HTMLScraper           ← Fallback HTML (BeautifulSoup)

  BodeDetector             ← Integração com Gemini (07_gemini_translator.py)
  CrawlerOrchestrator      ← Lê registry, instancia crawlers, roda em paralelo

  CrawlerActivity Firestore: crawler_activity/{run_id}
    → Fonte de dados em tempo real para o DataPulse.jsx no AdminDashboard

Variáveis de ambiente:
  GOOGLE_APPLICATION_CREDENTIALS  → Firestore + BigQuery
  GEMINI_API_KEY                   → Detecção de Bodes com IA
  TRANSPARENCIA_API_KEY            → Portal da Transparência

Uso:
  python engines/10_universal_crawler.py
  python engines/10_universal_crawler.py --max-workers 8
  python engines/10_universal_crawler.py --api-ids dou_rss_edicao1 transparencia_contratos
  python engines/10_universal_crawler.py --no-gemini          # pula detecção IA
  python engines/10_universal_crawler.py --dry-run            # sem salvar dados
  python engines/10_universal_crawler.py --kill-check         # respeita Kill Switch
"""

from __future__ import annotations

import abc
import argparse
import importlib.util
import json
import logging
import os
import re
import sys
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("crawler")

# ─── Constantes ───────────────────────────────────────────────────────────────
REGISTRY_PATH      = os.path.join(os.path.dirname(__file__), "registry_apis.json")
ENGINES_DIR        = os.path.dirname(__file__)
FIRESTORE_PROJECT  = "fiscallizapa"
BQ_PROJECT         = "projeto-codex-br"
ACTIVITY_COLLECTION = "crawler_activity"
DEFAULT_TIMEOUT    = 30        # segundos por request HTTP
DEFAULT_WORKERS    = 6         # threads paralelas
MAX_PAGES          = 10        # limite de paginação por API
MAX_BODE_CHARS     = 3000      # truncamento do texto para Gemini
BODE_RESPONSE_SCHEMA = {
    "is_bode":            False,
    "tipo_alerta":        None,
    "criticidade":        "BAIXA",
    "descricao":          None,
    "entidades_suspeitas": [],
    "valores_suspeitos":   [],
}


# ─────────────────────────────────────────────────────────────────────────────
# Resultado de execução
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class CrawlerResult:
    api_id:         str
    api_name:       str
    api_type:       str
    status:         str          # "done" | "error" | "skipped"
    records_fetched: int   = 0
    bodes_detected:  int   = 0
    duration_ms:     int   = 0
    error_message:   Optional[str] = None
    pages_fetched:   int   = 0


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de template de parâmetros
# ─────────────────────────────────────────────────────────────────────────────
def _expand_params(params: dict) -> dict:
    """Substitui placeholders ${...} nos parâmetros por valores dinâmicos."""
    today     = date.today()
    subs = {
        "${TODAY}":              today.strftime("%d/%m/%Y"),
        "${CURRENT_YEAR}":       str(today.year),
        "${DATE_30_DAYS_AGO}":   (today - timedelta(days=30)).strftime("%d/%m/%Y"),
        "${DATE_365_DAYS_AGO}":  (today - timedelta(days=365)).strftime("%d/%m/%Y"),
        "${TRANSPARENCIA_API_KEY}": os.environ.get("TRANSPARENCIA_API_KEY", ""),
    }
    result = {}
    for k, v in params.items():
        if isinstance(v, str):
            for placeholder, value in subs.items():
                v = v.replace(placeholder, value)
        result[k] = v
    return result


def _expand_headers(headers: dict) -> dict:
    """Substitui placeholders nos headers."""
    subs = {
        "${TRANSPARENCIA_API_KEY}": os.environ.get("TRANSPARENCIA_API_KEY", ""),
    }
    result = {}
    for k, v in headers.items():
        if isinstance(v, str):
            for ph, val in subs.items():
                v = v.replace(ph, val)
        result[k] = v
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Detecção de Bodes via Gemini
# ─────────────────────────────────────────────────────────────────────────────
class BodeDetector:
    """Chama o Gemini para analisar texto de atos e identificar irregularidades."""

    _PROMPT = """Você é o A.S.M.O.D.E.U.S., sistema de auditoria forense parlamentar.

Analise o seguinte trecho de ato oficial ou dado público e responda APENAS com JSON válido:
{{
  "is_bode": true/false,
  "tipo_alerta": "DISPENSA_LICITACAO|NEPOTISMO|SUPERFATURAMENTO|EMPRESA_FANTASMA|ADITIVO_ABUSIVO|EMERGENCIAL|OUTRO|null",
  "criticidade": "ALTA|MEDIA|BAIXA",
  "descricao": "breve descrição da irregularidade ou null",
  "entidades_suspeitas": ["lista de nomes/CNPJ suspeitos"],
  "valores_suspeitos": [lista de valores financeiros encontrados como números]
}}

Critérios para is_bode = true:
- Dispensa ou inexigibilidade de licitação
- Nomeação de parentes (nepotismo)
- Valor de contrato muito acima do mercado
- Empresa recém-constituída (< 6 meses) recebendo contrato grande
- Aditivo contratual > 25% do valor original
- Contratação emergencial sem justificativa clara
- CNPJ com endereço de residência recebendo verba pública

Texto a analisar:
{text}

Responda APENAS com JSON. Sem texto extra."""

    def __init__(self, model_name: str = "gemini-1.5-flash"):
        self._model     = None
        self._model_name = model_name
        self._disabled   = False

    def _ensure_model(self) -> bool:
        if self._disabled:
            return False
        if self._model is not None:
            return True
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            log.warning("GEMINI_API_KEY não definida — detecção de Bodes desativada.")
            self._disabled = True
            return False
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            self._model = genai.GenerativeModel(
                model_name=self._model_name,
                generation_config={"temperature": 0.1, "max_output_tokens": 400},
            )
            return True
        except ImportError:
            log.warning("google-generativeai não instalado — Bode detection off.")
            self._disabled = True
            return False

    def analyze(self, text: str, keywords: list[str] | None = None) -> dict | None:
        """
        Analisa `text` com Gemini. Retorna None se não é bode ou se falhar.
        Otimização: antes de chamar Gemini, verifica keywords localmente para
        evitar chamadas desnecessárias (economia de quota/custo).
        """
        if not text or len(text.strip()) < 50:
            return None

        # Pré-filtro local por keywords (evita chamada Gemini se não há suspeita)
        if keywords:
            text_lower = text.lower()
            if not any(kw.lower() in text_lower for kw in keywords):
                return None   # sem keyword suspeita → não é bode

        if not self._ensure_model():
            return None

        truncated = text[:MAX_BODE_CHARS]
        prompt = self._PROMPT.format(text=truncated)

        for attempt in range(3):
            try:
                response = self._model.generate_content(prompt)
                raw = (response.text or "").strip()
                # Extrair JSON da resposta (às vezes Gemini adiciona backticks)
                m = re.search(r'\{.*\}', raw, re.DOTALL)
                if not m:
                    return None
                data = json.loads(m.group())
                if data.get("is_bode"):
                    return {**BODE_RESPONSE_SCHEMA, **data}
                return None
            except Exception as exc:
                err = str(exc).lower()
                if "429" in err or "quota" in err:
                    wait = 4 * (2 ** attempt)
                    log.warning("Gemini rate limit — aguardando %ds", wait)
                    time.sleep(wait)
                else:
                    log.debug("Gemini analyze error: %s", exc)
                    return None
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Classe base abstrata
# ─────────────────────────────────────────────────────────────────────────────
class AsmodeusCrawler(abc.ABC):
    """
    Contrato base para todos os crawlers do A.S.M.O.D.E.U.S.
    Subclasses implementam `fetch()` e `parse()`.
    O orquestrador chama `run()`.
    """

    def __init__(self, config: dict, bode_detector: BodeDetector,
                 db: Any = None, bq_client: Any = None, dry_run: bool = False):
        self.config        = config
        self.detector      = bode_detector
        self.db            = db
        self.bq_client     = bq_client
        self.dry_run       = dry_run
        self.api_id        = config["id"]
        self.api_name      = config["name"]
        self.api_type      = config["type"]
        self.url           = config["url"]
        self.headers       = _expand_headers(config.get("headers", {}))
        self.params        = _expand_params(config.get("params", {}))
        self.bq_table      = config.get("bq_table")
        self.firestore_col = config.get("firestore_col")
        self.bode_detect   = config.get("bode_detection", False)
        self.bode_keywords = config.get("bode_keywords", [])
        self.rate_ms       = config.get("rate_limit_ms", 1000)
        self.pagination    = config.get("pagination")
        self._log          = logging.getLogger(f"crawler.{self.api_id}")

    # ── Interface obrigatória ────────────────────────────────────────────────
    @abc.abstractmethod
    def fetch(self) -> Any:
        """Executa a requisição HTTP e retorna dados brutos."""

    @abc.abstractmethod
    def parse(self, raw: Any) -> list[dict]:
        """Transforma dados brutos em lista de registros estruturados."""

    # ── Implementação padrão ─────────────────────────────────────────────────
    def extract_text_for_bode(self, record: dict) -> str:
        """Extrai texto relevante para análise de Bode. Override se necessário."""
        text_fields = ["titulo", "descricao", "conteudo", "objeto", "justificativa",
                       "description", "title", "summary", "ementa"]
        parts = [str(record.get(f, "")) for f in text_fields if record.get(f)]
        return " | ".join(parts)

    def save_to_bq(self, records: list[dict]) -> None:
        if not records or not self.bq_table or self.dry_run:
            return
        try:
            spec = importlib.util.spec_from_file_location(
                "bq_setup", os.path.join(ENGINES_DIR, "01_bq_setup.py")
            )
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            import pandas as pd
            df = pd.DataFrame(records)
            mod.sanitize_and_load(df, self.bq_table)
            self._log.info("  BQ: %d registros → %s", len(records), self.bq_table)
        except Exception as e:
            self._log.error("  BQ save error: %s", e)

    def save_bode_to_firestore(self, record: dict, bode: dict) -> None:
        if not self.db or not self.firestore_col or self.dry_run:
            return
        try:
            from google.cloud.firestore_v1 import SERVER_TIMESTAMP
            alert_id = f"{self.api_id}_{record.get('id','')or uuid.uuid4().hex[:8]}"
            self.db.collection(self.firestore_col).document(alert_id).set({
                "id":               alert_id,
                "origem":           self.api_id,
                "fonte":            self.api_name,
                "tipoAlerta":       bode.get("tipo_alerta", "CRAWLER_DETECTION"),
                "criticidade":      bode.get("criticidade", "MEDIA"),
                "descricao":        bode.get("descricao") or "Irregularidade detectada pelo crawler.",
                "entidadesSuspeitas": bode.get("entidades_suspeitas", []),
                "valoresSuspeitos": bode.get("valores_suspeitos", []),
                "parlamentarNome":  record.get("nome") or record.get("title", "–"),
                "uf":               record.get("uf") or record.get("estado", "–"),
                "partido":          record.get("partido", "–"),
                "criadoEm":         SERVER_TIMESTAMP,
                "dadosBrutos":      {k: str(v)[:500] for k, v in list(record.items())[:10]},
            }, merge=True)
        except Exception as e:
            self._log.error("  Firestore bode save error: %s", e)

    def run(self) -> CrawlerResult:
        """Executa o ciclo completo: fetch → parse → detect → save."""
        t0      = time.monotonic()
        records = []
        bodes   = 0

        try:
            self._log.info("Iniciando: %s", self.api_name)
            raw     = self.fetch()
            records = self.parse(raw)
            self._log.info("  %d registros extraídos", len(records))

            # Salvar no BigQuery
            if records:
                self.save_to_bq(records)

            # Detectar Bodes com Gemini
            if self.bode_detect and self.detector and records:
                for record in records[:50]:   # cap: 50 por execução para economizar quota
                    text = self.extract_text_for_bode(record)
                    bode = self.detector.analyze(text, self.bode_keywords)
                    if bode:
                        self.save_bode_to_firestore(record, bode)
                        bodes += 1
                        self._log.info("  🐐 Bode detectado: %s", bode.get("tipo_alerta"))
                    time.sleep(self.rate_ms / 1000)

            duration = int((time.monotonic() - t0) * 1000)
            return CrawlerResult(
                api_id=self.api_id, api_name=self.api_name, api_type=self.api_type,
                status="done", records_fetched=len(records), bodes_detected=bodes,
                duration_ms=duration,
            )
        except Exception as exc:
            duration = int((time.monotonic() - t0) * 1000)
            self._log.error("  FALHOU: %s", exc)
            return CrawlerResult(
                api_id=self.api_id, api_name=self.api_name, api_type=self.api_type,
                status="error", records_fetched=len(records), bodes_detected=bodes,
                duration_ms=duration, error_message=str(exc)[:300],
            )


# ─────────────────────────────────────────────────────────────────────────────
# RSSCrawler — Feeds RSS/Atom (DOU, DOE, DOM)
# ─────────────────────────────────────────────────────────────────────────────
class RSSCrawler(AsmodeusCrawler):
    """
    Crawl de feeds RSS/Atom. Extrai título, link, descrição e data de publicação.
    Usa `feedparser` se disponível; fallback para XML manual com `xml.etree`.
    """

    def fetch(self) -> Any:
        import urllib.request
        req = urllib.request.Request(self.url, headers=self.headers)
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            return resp.read().decode("utf-8", errors="replace")

    def parse(self, raw: str) -> list[dict]:
        records = []
        # Tentar feedparser
        try:
            import feedparser
            feed = feedparser.parse(raw)
            for entry in feed.entries[:100]:
                records.append({
                    "id":              entry.get("id") or entry.get("link", "")[:100],
                    "titulo":          entry.get("title", "–")[:500],
                    "link":            entry.get("link", ""),
                    "descricao":       entry.get("summary", "")[:2000],
                    "conteudo":        entry.get("content", [{"value": ""}])[0].get("value", "")[:3000],
                    "data_publicacao": entry.get("published", ""),
                    "origem":          self.api_id,
                    "tipo":            "diario_oficial",
                })
            return records
        except ImportError:
            pass

        # Fallback manual XML
        try:
            import xml.etree.ElementTree as ET
            root = ET.fromstring(raw)
            ns   = {"atom": "http://www.w3.org/2005/Atom"}
            # RSS 2.0
            for item in root.iter("item"):
                records.append({
                    "id":              (item.findtext("guid") or item.findtext("link") or "")[:100],
                    "titulo":          (item.findtext("title") or "")[:500],
                    "link":            item.findtext("link") or "",
                    "descricao":       (item.findtext("description") or "")[:2000],
                    "conteudo":        "",
                    "data_publicacao": item.findtext("pubDate") or "",
                    "origem":          self.api_id,
                    "tipo":            "diario_oficial",
                })
            # Atom
            if not records:
                for entry in root.findall("atom:entry", ns):
                    records.append({
                        "id":              (entry.findtext("atom:id", namespaces=ns) or "")[:100],
                        "titulo":          (entry.findtext("atom:title", namespaces=ns) or "")[:500],
                        "link":            "",
                        "descricao":       (entry.findtext("atom:summary", namespaces=ns) or "")[:2000],
                        "conteudo":        "",
                        "data_publicacao": entry.findtext("atom:published", namespaces=ns) or "",
                        "origem":          self.api_id,
                        "tipo":            "diario_oficial",
                    })
        except Exception as e:
            self._log.warning("XML parse fallback error: %s", e)
        return records


# ─────────────────────────────────────────────────────────────────────────────
# JSONAPICrawler — REST APIs com paginação automática
# ─────────────────────────────────────────────────────────────────────────────
class JSONAPICrawler(AsmodeusCrawler):
    """
    Crawl de APIs REST que retornam JSON. Suporta paginação automática
    por `page`/`offset`/`cursor`. Para cada página, aguarda `rate_limit_ms`.
    """

    def fetch(self) -> Any:
        import urllib.request, urllib.parse
        records = []
        params  = dict(self.params)

        if not self.pagination:
            # Requisição única
            url = self.url + ("?" + urllib.parse.urlencode(params) if params else "")
            req = urllib.request.Request(url, headers=self.headers)
            with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))

        # Paginação
        page_param = self.pagination.get("param", "pagina")
        page_size  = self.pagination.get("page_size", 100)
        page       = 1

        for _ in range(MAX_PAGES):
            params[page_param] = page
            url = self.url + "?" + urllib.parse.urlencode(params)
            try:
                req = urllib.request.Request(url, headers=self.headers)
                with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                batch = self._extract_list(data)
                if not batch:
                    break
                records.extend(batch)
                if len(batch) < page_size:
                    break   # última página
                page += 1
                time.sleep(self.rate_ms / 1000)
            except Exception as exc:
                self._log.warning("Paginação parou na página %d: %s", page, exc)
                break

        return records

    def _extract_list(self, data: Any) -> list:
        """Extrai a lista de registros de várias estruturas de resposta comuns."""
        if isinstance(data, list):
            return data
        for key in ("dados", "data", "items", "results", "content", "registros"):
            if isinstance(data, dict) and key in data:
                val = data[key]
                if isinstance(val, list):
                    return val
        return []

    def parse(self, raw: Any) -> list[dict]:
        items = raw if isinstance(raw, list) else self._extract_list(raw)
        result = []
        for item in items:
            if not isinstance(item, dict):
                continue
            # Normalização básica de campos comuns
            record = {
                "id":      str(item.get("id") or item.get("codigo") or item.get("numeroContrato") or "")[:100],
                "origem":  self.api_id,
                **{k: str(v)[:1000] if v is not None else None for k, v in item.items()},
            }
            result.append(record)
        return result


# ─────────────────────────────────────────────────────────────────────────────
# HTMLScraper — fallback para páginas HTML
# ─────────────────────────────────────────────────────────────────────────────
class HTMLScraper(AsmodeusCrawler):
    """Scraper HTML de último recurso usando html.parser da stdlib."""

    def fetch(self) -> Any:
        import urllib.request, urllib.parse
        params = _expand_params(self.params)
        url    = self.url + ("?" + urllib.parse.urlencode(params) if params else "")
        req    = urllib.request.Request(url, headers=self.headers)
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            return resp.read().decode("utf-8", errors="replace")

    def parse(self, raw: str) -> list[dict]:
        """Extrai texto visível de parágrafos e títulos."""
        from html.parser import HTMLParser

        class TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self.texts = []
                self._skip = False

            def handle_starttag(self, tag, attrs):
                if tag in ("script", "style", "nav", "footer"):
                    self._skip = True

            def handle_endtag(self, tag):
                if tag in ("script", "style", "nav", "footer"):
                    self._skip = False

            def handle_data(self, data):
                if not self._skip and data.strip():
                    self.texts.append(data.strip())

        parser = TextExtractor()
        parser.feed(raw)
        full_text = " ".join(parser.texts)
        return [{
            "id":              f"{self.api_id}_{date.today().isoformat()}",
            "titulo":          f"HTML Scrape: {self.api_name}",
            "conteudo":        full_text[:5000],
            "data_publicacao": date.today().isoformat(),
            "origem":          self.api_id,
            "tipo":            "html_scrape",
        }]


# ─────────────────────────────────────────────────────────────────────────────
# Factory
# ─────────────────────────────────────────────────────────────────────────────
def make_crawler(config: dict, detector: BodeDetector,
                 db: Any = None, bq: Any = None, dry_run: bool = False) -> AsmodeusCrawler:
    t = config.get("type", "json_api").lower()
    cls = {"rss": RSSCrawler, "json_api": JSONAPICrawler, "html": HTMLScraper}.get(t, JSONAPICrawler)
    return cls(config, detector, db=db, bq_client=bq, dry_run=dry_run)


# ─────────────────────────────────────────────────────────────────────────────
# Orquestrador
# ─────────────────────────────────────────────────────────────────────────────
class CrawlerOrchestrator:
    """
    Lê registry_apis.json, instancia os crawlers e executa em paralelo.
    Grava atividade em Firestore (crawler_activity) para o DataPulse.jsx.
    """

    def __init__(self, db: Any = None, bq: Any = None,
                 max_workers: int = DEFAULT_WORKERS,
                 use_gemini: bool = True,
                 dry_run: bool = False,
                 kill_check: bool = False):
        self.db          = db
        self.bq          = bq
        self.max_workers = max_workers
        self.dry_run     = dry_run
        self.kill_check  = kill_check
        self.detector    = BodeDetector() if use_gemini else None

    def load_registry(self, api_ids: list[str] | None = None) -> list[dict]:
        with open(REGISTRY_PATH, encoding="utf-8") as f:
            registry = json.load(f)
        apis = [a for a in registry["apis"] if a.get("active", True)]
        if api_ids:
            apis = [a for a in apis if a["id"] in api_ids]
        return sorted(apis, key=lambda a: a.get("priority", 99))

    def _is_kill_switch_active(self) -> bool:
        if not self.kill_check or not self.db:
            return False
        try:
            snap = self.db.collection("config").document("sistema").get()
            return snap.data().get("apiPausada", False) if snap.exists else False
        except Exception:
            return False

    def _write_activity(self, run_id: str, results: list[CrawlerResult],
                        status: str = "running") -> None:
        """Escreve atividade em tempo real para o DataPulse.jsx ler."""
        if not self.db or self.dry_run:
            return
        try:
            from google.cloud.firestore_v1 import SERVER_TIMESTAMP
            payload = {
                "run_id":       run_id,
                "status":       status,
                "updatedAt":    SERVER_TIMESTAMP,
                "total_records": sum(r.records_fetched for r in results),
                "total_bodes":   sum(r.bodes_detected  for r in results),
                "apis": [
                    {
                        "api_id":       r.api_id,
                        "api_name":     r.api_name,
                        "api_type":     r.api_type,
                        "status":       r.status,
                        "records":      r.records_fetched,
                        "bodes":        r.bodes_detected,
                        "duration_ms":  r.duration_ms,
                        "error":        r.error_message,
                    }
                    for r in results
                ],
            }
            if status == "running":
                payload["startedAt"] = SERVER_TIMESTAMP
            self.db.collection(ACTIVITY_COLLECTION).document(run_id).set(payload, merge=True)
        except Exception as exc:
            log.debug("Activity write error: %s", exc)

    def run(self, api_ids: list[str] | None = None) -> list[CrawlerResult]:
        if self._is_kill_switch_active():
            log.warning("Kill Switch ATIVO — crawlers abortados.")
            return []

        apis    = self.load_registry(api_ids)
        run_id  = f"run_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        results: list[CrawlerResult] = []

        log.info("══ Iniciando run %s · %d APIs · %d workers ══",
                 run_id, len(apis), self.max_workers)
        self._write_activity(run_id, [], status="running")

        with ThreadPoolExecutor(max_workers=self.max_workers,
                                thread_name_prefix="asmodeus") as pool:
            future_to_api = {
                pool.submit(
                    make_crawler(cfg, self.detector, self.db, self.bq, self.dry_run).run
                ): cfg
                for cfg in apis
            }

            for future in as_completed(future_to_api):
                cfg = future_to_api[future]
                try:
                    result = future.result()
                except Exception as exc:
                    result = CrawlerResult(
                        api_id=cfg["id"], api_name=cfg["name"],
                        api_type=cfg.get("type","?"),
                        status="error", error_message=str(exc)[:300],
                    )
                results.append(result)
                status_icon = "✓" if result.status == "done" else "✗"
                log.info("%s [%s] %d rec · %d bodes · %dms",
                         status_icon, result.api_id, result.records_fetched,
                         result.bodes_detected, result.duration_ms)

                # Atualizar atividade em tempo real a cada resultado
                self._write_activity(run_id, results, status="running")

        self._write_activity(run_id, results, status="done")

        done  = sum(1 for r in results if r.status == "done")
        err   = sum(1 for r in results if r.status == "error")
        total_rec   = sum(r.records_fetched for r in results)
        total_bodes = sum(r.bodes_detected  for r in results)
        log.info("══ Run %s concluído: %d✓  %d✗  |  %d registros  %d bodes ══",
                 run_id, done, err, total_rec, total_bodes)
        return results


# ─────────────────────────────────────────────────────────────────────────────
# Inicialização de clientes
# ─────────────────────────────────────────────────────────────────────────────
def _init_clients(project_fs: str) -> tuple[Any, Any]:
    sa_key = os.environ.get("FIRESTORE_SA_KEY") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    try:
        import firebase_admin
        from firebase_admin import credentials as fb_cred, firestore
        if not firebase_admin._apps:
            cred = fb_cred.Certificate(sa_key) if sa_key and os.path.isfile(sa_key) else fb_cred.ApplicationDefault()
            firebase_admin.initialize_app(cred, {"projectId": project_fs})
        db = firestore.client()
    except Exception:
        db = None

    try:
        from google.cloud import bigquery
        bq = bigquery.Client(project=BQ_PROJECT)
    except Exception:
        bq = None

    return db, bq


# ─────────────────────────────────────────────────────────────────────────────
# Ponto de entrada
# ─────────────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Universal API Crawler — A.S.M.O.D.E.U.S.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--api-ids",     nargs="+",
                        help="IDs específicos da registry (ex: dou_rss_edicao1 transparencia_contratos)")
    parser.add_argument("--max-workers", type=int, default=DEFAULT_WORKERS)
    parser.add_argument("--no-gemini",   action="store_true",
                        help="Desativa detecção de Bodes via Gemini")
    parser.add_argument("--dry-run",     action="store_true",
                        help="Simula sem salvar dados")
    parser.add_argument("--kill-check",  action="store_true",
                        help="Respeita Kill Switch do Firestore config/sistema")
    parser.add_argument("--project",     default=FIRESTORE_PROJECT)
    args = parser.parse_args()

    if args.dry_run:
        log.info("══ MODO DRY-RUN ══")

    db, bq = _init_clients(args.project)

    orchestrator = CrawlerOrchestrator(
        db=db, bq=bq,
        max_workers=args.max_workers,
        use_gemini=not args.no_gemini,
        dry_run=args.dry_run,
        kill_check=args.kill_check,
    )

    results = orchestrator.run(api_ids=args.api_ids)

    # Sumário final
    print("\n" + "═"*64)
    print(f"{'API ID':<35} {'STATUS':<8} {'REC':>6} {'BODES':>6} {'ms':>7}")
    print("─"*64)
    for r in sorted(results, key=lambda x: x.api_id):
        print(f"{r.api_id:<35} {r.status:<8} {r.records_fetched:>6} "
              f"{r.bodes_detected:>6} {r.duration_ms:>7}")
    print("═"*64)
    errors = [r for r in results if r.status == "error"]
    if errors:
        print(f"\n⚠  {len(errors)} APIs com erro:")
        for r in errors:
            print(f"   {r.api_id}: {r.error_message}")


if __name__ == "__main__":
    main()
