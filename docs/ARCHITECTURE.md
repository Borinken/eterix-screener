# Arquitectura

```
                     ┌─────────────────────┐
   usuario ────────► │  web (Next.js/       │
                      │  Vercel) — eterix.io │
                     └──────────┬───────────┘
                                │  lee/escribe (service role)
                                ▼
                     ┌───────────────────────┐
                     │  Supabase (Postgres)  │
                     │  wallet_scores        │
                     │  scan_requests        │
                     └──────────┬────────────┘
                                │  polling (5s)
                                ▼
                     ┌───────────────────────┐
                     │  worker (Python)      │
                     │  proceso propio,       │
                     │  su propia GMGN key   │
                     └──────────┬────────────┘
                                │  subprocess, rate-limited
                                ▼
                          gmgn-cli → GMGN.ai
```

## Por qué está partido en tres piezas

`gmgn-cli` tiene un rate limit chico (pensado para un solo poller cada ~3s) y
banea la IP si se excede, con bans que escalan (5s → 5min) mientras se lo
sigue llamando durante el ban. Un backend público no puede llamarlo directo:
el primer poco de tráfico real lo tira.

La web nunca toca `gmgn-cli`. Solo lee/escribe en Supabase. El worker es el
único proceso que habla con GMGN, a su propio ritmo, con su propia cuenta —
aislado de cualquier otro consumidor (incluido cualquier bot de trading que
use la misma técnica en otro proyecto).

## Modelo de datos

- `wallet_scores` — una fila por wallet, es un caché compartido. Una vez
  analizada, el resultado es gratis para cualquiera que la vuelva a buscar.
- `scan_requests` — una fila por pedido de análisis. Trackea la cuota
  gratuita diaria por IP y, si se agotó, la referencia/firma del pago en
  Solana que autorizó un análisis nuevo.

## Cobro (Solana Pay)

Sin cuentas, sin login, sin terceros. El usuario aprueba el pago desde su
propia wallet (Phantom, Solflare, etc.); el backend verifica on-chain que el
pago llegó a la wallet configurada en `MERCHANT_WALLET_ADDRESS` antes de
encolar el análisis. Ver `web/lib/solanaPay.ts`.

## Detección: Copyability Score

Un trade se marca como **arbitraje atómico** (no copiable) si su compra y su
venta del mismo token ocurrieron dentro de la misma transacción — una
propiedad verificable on-chain, no una estimación. El score actual pesa por
cantidad de trades; pesarlo por volumen en SOL es la mejora más importante
del roadmap (ver `docs/ROADMAP.md`) porque una wallet puede tener 90% de sus
trades atómicos y aun así tener su ganancia real concentrada en el 10%
restante.
