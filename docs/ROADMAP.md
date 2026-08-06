# Roadmap

## v1 (actual)

- [x] Copyability Score para wallets de Solana, gratis con caché compartido.
- [x] Cuota gratuita diaria por IP + micropago en Solana Pay para wallets nuevas.
- [x] Worker aislado, con su propia cuenta de GMGN.
- [ ] Score ponderado por volumen en SOL, no solo por cantidad de trades —
      la mejora de exactitud más importante pendiente. Una wallet puede
      tener 90% de sus trades como arbitraje atómico y aun así concentrar su
      ganancia real en el 10% restante; contar trades sin pesar por tamaño
      puede dar un veredicto engañoso.
- [ ] Ejemplo real fijado en la home (primer resultado real del worker en
      producción), no un dato inventado.

## v2 — API para bots de copytrade (la vía de ingreso principal)

- [ ] Endpoint autenticado por API key (`/api/v1/score`).
- [ ] Tiers de precio por volumen de consultas.
- [ ] Salida a operadores de bots de Telegram medianos (no los gigantes,
      que van a preferir construirlo adentro).

## v3 — Multi-chain (evaluar, no dar por sentado)

- **Ethereum**: el concepto de arbitraje atómico/MEV existe y es real ahí
  también, pero necesita un pipeline de datos completamente distinto —
  no hay equivalente a `gmgn-cli`. Diseño aparte, no un checkbox.
- **Bitcoin**: **fuera de alcance a propósito.** Bitcoin no tiene DEXs ni
  arbitraje atómico en capa 1 — el mecanismo que este producto mide no
  existe ahí. Un "Copyability Score" de Bitcoin sería una feature vacía,
  no una funcionalidad real.

## Ideas descartadas conscientemente

- **Insignias "verificado" pagas para proyectos**: crea conflicto de
  interés y mata la credibilidad del score. No se va a vender.
- **"Homologación" o certificación propia auto-otorgada**: sin organismo
  real detrás, es una afirmación engañosa. No se usa ese lenguaje en
  ningún material de marketing.
