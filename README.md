# Eterix Screener

Scores how *copyable* a Solana wallet actually is.

Paste a wallet address and it reports what share of its history is **atomic
arbitrage** — buy and sell inside the same transaction, impossible to replicate
with any network delay — versus **sequential alpha**, which a copy-trading
strategy can realistically follow.

The distinction matters because a wallet can show an excellent P&L and still be
completely uncopyable. Copy-trading tools rank wallets by returns and quietly
omit this.

---

## Architecture

```
Browser ──► Next.js (Vercel)
              │  POST /api/scan       enqueue a wallet
              │  GET  /api/score/:w   read a finished score
              ▼
          Supabase (Postgres)   ◄── queue + results
              ▲
              │  poll → analyse → write back
              │
   Python worker (Railway / VPS / local)
              │
              ▼
          gmgn-cli  ── rate limited, single consumer
```

### Why the worker is a separate process

`gmgn-cli` enforces a small rate limit designed for a single poller and bans the
source IP when exceeded. A public web endpoint calling it directly would get the
key banned with the first burst of traffic.

Splitting the system means the web tier only ever touches Postgres. Requests are
enqueued; the worker drains the queue at whatever pace the upstream limit
allows. Traffic spikes become queue depth instead of a ban.

This is also why the API routes use the `service_role` key rather than `anon` —
they need to write queue rows without fighting RLS, and they are the only writer.

### Credential isolation

`gmgn-cli` stores its API key at `~/.config/gmgn/.env`, resolved through Node's
`os.homedir()` — confirmed by reading the installed package's `dist/config.js`,
not assumed from documentation. That means `HOME` is the only variable that
actually redirects it; there is no `GMGN_HOME`, despite the name suggesting one.

The worker overrides `HOME` to `worker/.gmgn-home/` on every invocation. It
therefore cannot read or overwrite the credentials of any other `gmgn-cli`
consumer on the same machine, even when both run under the same user account.

---

## Layout

| Path | What it is |
|---|---|
| `web/` | Next.js app — public form plus `/api/scan` and `/api/score/[wallet]`. Deploys to Vercel. Talks only to Supabase. |
| `worker/` | Long-running Python process. The only component that calls `gmgn-cli`. |
| `supabase/migrations/` | Schema. Applied with `supabase db push`. |
| `docs/` | Architecture notes and roadmap. |

---

## Setup

### 1. Database

```bash
supabase link --project-ref <ref>
supabase db push
```

Use a dedicated Supabase project. From Settings → API, copy the project URL and
the `service_role` key.

### 2. Isolated gmgn-cli key

From `worker/`:

```bash
HOME=./.gmgn-home npx gmgn-cli config
```

This prints a link. Create an API key there under an account separate from any
other consumer, then apply it:

```bash
HOME=./.gmgn-home npx gmgn-cli config --apply <api_key>
```

`worker/.gmgn-home/` is gitignored and never leaves the machine.

### 3. Worker

```bash
cd worker
cp .env.example .env      # Supabase URL + service_role key
pip install -r requirements.txt
python screener_worker.py
```

For production this needs to stay up continuously — Railway, Docker
(`docker build -t eterix-worker .`), or any VPS with a supervised process.

### 4. Web

```bash
cd web
npm install
cp .env.local.example .env.local
npm run dev
```

Deploy with `vercel`, then set `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` in the project's environment variables.

---

## CI

Two workflows run on push and pull request:

- `ci.yml` — builds the Next.js app against placeholder credentials, so a build
  break is caught without any real secret being available to CI.
- `worker.yml` — syntax and import checks for the Python worker.

---

## Disclaimer

The site states plainly that this is information, not financial advice. A
copyability score describes the *mechanical structure* of a wallet's past
transactions. It is not a prediction, a recommendation, or a signal to act on.

## License

MIT — see [LICENSE](LICENSE).
