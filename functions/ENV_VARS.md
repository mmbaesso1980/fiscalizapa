# Variáveis de ambiente (Cloud Functions)

## Portal da Transparência — API de Dados

As callables que chamam `api.portaldatransparencia.gov.br` exigem:

- **`PORTAL_TRANSPARENCIA_API_KEY`** — valor da chave; envie no header HTTP como **`chave-api-dados`** (a API não usa Bearer).

Configure no **Firebase Console** → **Functions** → configuração de ambiente do runtime, ou em arquivo `.env` local para emulador (não commitar valores reais).

Documentação: https://api.portaldatransparencia.gov.br/
