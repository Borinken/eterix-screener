# Eterix Screener — Copyability Score

Pegás una wallet de Solana, te dice qué % de su historial es arbitraje
atómico (compra+venta en la misma tx — imposible de copiar con delay) vs.
alpha secuencial real (sí copiable). Proyecto independiente, sin relación de
código con ningún otro repo.

## Piezas

- `web/` — Next.js, se deploya en Vercel. Formulario público + dos API
  routes (`/api/scan`, `/api/score/[wallet]`) que solo leen/escriben en
  Supabase, nunca llaman a gmgn-cli directamente.
- `worker/` — proceso Python de larga duración (correr en Railway, un VPS,
  o tu máquina) que hace polling a Supabase, llama a `gmgn-cli` respetando
  su rate limit, y escribe el resultado de vuelta. Es el único componente
  que habla con GMGN.
- `supabase/schema.sql` — la única tabla que necesita el proyecto.

**Por qué está separado en dos partes:** `gmgn-cli` tiene un rate limit
chico (pensado para un solo poller) y banea la IP si lo excedés. La web
pública no puede llamarlo directo o se banea con el primer poco de tráfico.
El worker actúa de buffer: encola pedidos, los procesa a su propio ritmo.

## 1. Supabase

1. Creá un proyecto nuevo en supabase.com (o usá uno que ya tengas, pero
   dedicado a esto — no el de otro proyecto).
2. `supabase link --project-ref <ref>` y `supabase db push` (aplica lo que
   hay en `supabase/migrations/`).
3. Settings → API → copiá `Project URL` y el `service_role` key (no el
   `anon` key — lo necesitamos para que el worker y las API routes puedan
   escribir sin pelear con RLS).

## 2. GMGN key aislada para el worker

`gmgn-cli` guarda su API key en `~/.config/gmgn/.env`, resuelto vía
`os.homedir()` de Node -- confirmado leyendo su código fuente instalado
(`dist/config.js`), no adivinado. Eso significa que la única variable que
de verdad lo redirige es `HOME` (no existe ningún `GMGN_HOME` real, pese a
lo que pueda sugerir el nombre). El worker fuerza su propio `HOME`
(`worker/.gmgn-home/`, o lo que pongas en `GMGN_ISOLATED_HOME`) en cada
llamada a `gmgn-cli`, así que **nunca puede leer ni pisar** la config que ya
usa el bot de trading real en la misma máquina, aunque corras todo en tu
misma compu.

Desde `worker/`:

```bash
HOME=./.gmgn-home npx gmgn-cli config
```

Esto imprime un link. Abrilo, creá la API key ahí (cuenta separada del bot),
y después:

```bash
HOME=./.gmgn-home npx gmgn-cli config --apply <la_api_key_que_te_dio_gmgn>
```

Listo -- `worker/.gmgn-home/` queda con la key aislada (ya está en
`.gitignore`, nunca se sube a GitHub).

**Si alguna vez ves `GMGN_HOME=...` en un comando (incluido en commits
viejos de este repo) es un error ya corregido -- esa variable no existe,
usá `HOME`.

## 3. Deploy del worker

```bash
cd worker
cp .env.example .env   # completá con los datos de Supabase
pip install -r requirements.txt
python screener_worker.py
```

Para producción: Railway (nuevo servicio, no el mismo que tu bot), Docker
(`docker build -t eterix-worker .`), o cualquier VPS con un proceso
supervisado (systemd, pm2, etc.) — tiene que quedar corriendo 24/7.

## 4. Deploy de la web en Vercel

```bash
cd web
npm install
cp .env.local.example .env.local   # completá con los datos de Supabase
npm run dev   # probar local en http://localhost:3000
```

Deploy:

1. `vercel` (o conectá el repo de GitHub desde el dashboard de Vercel).
2. En el proyecto de Vercel → Settings → Environment Variables, cargá
   `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
3. Settings → Domains → agregá `eterix.io` (dominio raíz, libre según lo
   confirmado) y seguí las instrucciones de Vercel para apuntar los DNS
   records donde tengas comprado el dominio.

## Disclaimer

El sitio dice explícitamente que esto es información, no asesoramiento de
inversión — no cambiar ese texto sin pensar bien las implicaciones legales.
