terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = "projeto-codex-br"
  region  = "us-central1"
}

resource "google_bigquery_dataset" "dataset" {
  dataset_id                  = "dados_legados"
  friendly_name               = "Dados Legados"
  description                 = "Dataset para os dados legados processados via ETL"
  location                    = "US"
}

resource "google_bigquery_table" "table" {
  dataset_id = google_bigquery_dataset.dataset.dataset_id
  table_id   = "transacoes"

  time_partitioning {
    type  = "DAY"
    field = "data_transacao"
  }

  clustering = ["cnpj_empresa", "codigo_parlamentar"]

  schema = <<SCHEMA
[
  {
    "name": "id",
    "type": "STRING",
    "mode": "REQUIRED"
  },
  {
    "name": "data_transacao",
    "type": "DATE",
    "mode": "REQUIRED"
  },
  {
    "name": "cnpj_empresa",
    "type": "STRING",
    "mode": "NULLABLE"
  },
  {
    "name": "codigo_parlamentar",
    "type": "STRING",
    "mode": "NULLABLE"
  },
  {
    "name": "cpf_beneficiario",
    "type": "STRING",
    "mode": "NULLABLE"
  },
  {
    "name": "nome_beneficiario",
    "type": "STRING",
    "mode": "NULLABLE"
  },
  {
    "name": "valor",
    "type": "FLOAT",
    "mode": "NULLABLE"
  }
]
SCHEMA
}
