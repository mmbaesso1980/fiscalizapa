"""
TransparenciaBR — base BigQuery (projeto-codex-br).

Conexão ao GCP e carga tipada a partir de pandas.
Credenciais: GOOGLE_APPLICATION_CREDENTIALS ou ambiente GCE/Cloud Run.
"""

from __future__ import annotations

import os
from typing import Iterable, Optional

import pandas as pd
from google.cloud import bigquery
from google.cloud.bigquery import LoadJob, LoadJobConfig

# Projeto GCP onde o BigQuery executa a camada pesada (IA / dados).
DEFAULT_BQ_PROJECT = "projeto-codex-br"
_ENV_PROJECT = "GCP_PROJECT_ID"


def get_bigquery_client(project_id: Optional[str] = None) -> bigquery.Client:
    """Cliente BigQuery; prioriza `project_id`, depois GCP_PROJECT_ID, depois default."""
    pid = project_id or os.environ.get(_ENV_PROJECT) or DEFAULT_BQ_PROJECT
    return bigquery.Client(project=pid)


def _series_to_int64(s: pd.Series) -> pd.Series:
    """Converte strings numéricas (ex.: '123') para Int64 anulável."""
    as_str = s.astype("string").str.strip()
    as_str = as_str.replace("", pd.NA).replace("nan", pd.NA, regex=False)
    num = pd.to_numeric(as_str, errors="coerce")
    return num.astype("Int64")


def _series_to_float64(s: pd.Series) -> pd.Series:
    as_str = s.astype("string").str.strip()
    as_str = as_str.replace("", pd.NA)
    return pd.to_numeric(as_str, errors="coerce").astype("float64")


def sanitize_dataframe(
    df: pd.DataFrame,
    *,
    int_columns: Optional[Iterable[str]] = None,
    float_columns: Optional[Iterable[str]] = None,
    str_columns: Optional[Iterable[str]] = None,
    datetime_columns: Optional[Iterable[str]] = None,
) -> pd.DataFrame:
    """
    Normaliza tipos antes do upload (ex.: STRING → INT64 via pandas Int64 anulável).

    Colunas não listadas são copiadas; demais tipos seguem até conversões explícitas.
    """
    out = df.copy()
    int_columns = set(int_columns or ())
    float_columns = set(float_columns or ())
    str_columns = set(str_columns or ())
    datetime_columns = set(datetime_columns or ())

    for col in int_columns:
        if col in out.columns:
            out[col] = _series_to_int64(out[col])

    for col in float_columns:
        if col in out.columns:
            out[col] = _series_to_float64(out[col])

    for col in str_columns:
        if col in out.columns:
            out[col] = out[col].astype("string")

    for col in datetime_columns:
        if col in out.columns:
            out[col] = pd.to_datetime(out[col], errors="coerce", utc=True)

    # Int64/float/datetime com <NA>/NaT serializam como NULL no load via pyarrow.
    return out


def sanitize_and_load(
    df: pd.DataFrame,
    table_id: str,
    *,
    project_id: Optional[str] = None,
    int_columns: Optional[Iterable[str]] = None,
    float_columns: Optional[Iterable[str]] = None,
    str_columns: Optional[Iterable[str]] = None,
    datetime_columns: Optional[Iterable[str]] = None,
    write_disposition: str = "WRITE_APPEND",
    schema: Optional[list[bigquery.SchemaField]] = None,
    location: Optional[str] = None,
) -> LoadJob:
    """
    Sanitiza o DataFrame e envia ao BigQuery via load_table_from_dataframe.

    `table_id`: `dataset.table` ou `project.dataset.table`.
    """
    client = get_bigquery_client(project_id)
    clean = sanitize_dataframe(
        df,
        int_columns=int_columns,
        float_columns=float_columns,
        str_columns=str_columns,
        datetime_columns=datetime_columns,
    )

    job_config = LoadJobConfig(
        write_disposition=write_disposition,
        autodetect=schema is None,
        schema=schema,
    )

    job = client.load_table_from_dataframe(
        clean,
        table_id,
        job_config=job_config,
        location=location,
    )
    job.result()
    return job


__all__ = [
    "DEFAULT_BQ_PROJECT",
    "get_bigquery_client",
    "sanitize_dataframe",
    "sanitize_and_load",
]
