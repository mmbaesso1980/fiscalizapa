# Variáveis de ambiente (Cloud Functions)

## Portal da Transparência

- **`PORTAL_TRANSPARENCIA_API_KEY`** — enviar nas requisições como header **`chave-api-dados`** (não usar Bearer).

Configure com `firebase functions:secrets:set PORTAL_TRANSPARENCIA_API_KEY` ou no Console do Firebase.

**Ligar o secret ao runtime (Gen 2):** após criar o secret, associe-o às functions que usam a API do Portal (ex.: `getEmendasParlamentar`, `getEmendasMapaPontos`, `forensicEngine`) no `firebase.json` / parâmetro `secrets` do `onCall`, **ou** defina a mesma variável em **Google Cloud Console → Cloud Functions → variáveis de ambiente** para o serviço. Sem isso, `process.env.PORTAL_TRANSPARENCIA_API_KEY` fica vazio e emendas/mapa retornam erro ou lista vazia.

Documentação: https://api.portaldatransparencia.gov.br/

## Mapa de emendas (Nominatim)

- Geocodificação usa **OpenStreetMap Nominatim**; resultados são guardados em Firestore na coleção **`geocode_cache`** (TTL ~90 dias, escrita só via Cloud Function).
- Regra: `geocode_cache` — leitura pública, escrita negada ao cliente (igual `gabinete_cache`).

## Stripe (pagamentos)

- **`STRIPE_SECRET_KEY`** — chave secreta (sk_live_... ou sk_test_...)
- **`STRIPE_WEBHOOK_SECRET`** — segredo do webhook (whsec_...)

### Preços por pacote (Stripe Price IDs)

Criar os produtos/preços no [Stripe Dashboard](https://dashboard.stripe.com/products) e configurar:

| Variável | Pacote | Valor | Créditos | Modo |
|----------|--------|-------|----------|------|
| `STRIPE_PRICE_STARTER_50` | Starter | R$ 19,90 | 50 | payment |
| `STRIPE_PRICE_PRO_200` | Profissional | R$ 59,90 | 200 | payment |
| `STRIPE_PRICE_ANALISTA_500` | Analista | R$ 129,90 | 500 | payment |
| `STRIPE_PRICE_ENTERPRISE` | Enterprise | R$ 299/mês | Ilimitado | subscription |

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:set STRIPE_PRICE_STARTER_50
firebase functions:secrets:set STRIPE_PRICE_PRO_200
firebase functions:secrets:set STRIPE_PRICE_ANALISTA_500
firebase functions:secrets:set STRIPE_PRICE_ENTERPRISE
```

### Pacotes legados (se ainda em uso)
| `STRIPE_PRICE_STARTER_10` | Starter antigo | R$ 9,90 | 10 | payment |
| `STRIPE_PRICE_PRO_50` | Pro antigo | R$ 39,90 | 50 | payment |
| `STRIPE_PRICE_ULTRA_200` | Ultra antigo | R$ 99,90 | 200 | payment |
| `STRIPE_PRICE_ILIMITADO` | Ilimitado antigo | R$ 199,90/mês | ∞ | subscription |
