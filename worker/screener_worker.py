"""Eterix Screener worker.

Polls the `wallet_scores` table in Supabase for rows with status='pending',
fetches each wallet's on-chain activity via gmgn-cli, and computes the
Copyability Score: what fraction of a wallet's trades are atomic
round-trips (buy+sell in the same transaction -- an atomic swap-through,
not a directional bet, and therefore something a delayed copy-trade could
never replicate) versus real sequential trades.

Run this as its own long-lived process, in its own environment, with its
own GMGN account/API key (`gmgn-cli config` once, by hand, in THIS
environment) -- never share the key/IP with any other gmgn-cli consumer, so
a rate-limit ban triggered by public traffic here can't affect anything
else.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime, timezone
from typing import Optional

from supabase import Client, create_client

GMGN_CLI_BIN = os.environ.get("GMGN_CLI_BIN", "gmgn-cli")

# gmgn-cli reads its own GMGN_HOME env var (NOT $HOME -- verified live
# 2026-08-07, overriding $HOME alone silently no-ops and falls through to
# whatever's on the default path) to locate its config. Pointing it at a
# folder private to this worker means `gmgn-cli config --apply <key>` here
# can NEVER read or overwrite whatever config a trading bot on the same
# machine already has under its own default GMGN_HOME.
GMGN_HOME = os.environ.get("GMGN_HOME", os.path.join(os.path.dirname(__file__), ".gmgn-home"))
os.makedirs(GMGN_HOME, exist_ok=True)
POLL_QUEUE_INTERVAL_SEC = 5.0
GMGN_CALL_INTERVAL_SEC = 3.0  # gmgn-cli's own leaky-bucket limit -- stay under it
CLI_TIMEOUT_SEC = 15.0
FETCH_LIMIT = 200
RATE_LIMIT_BACKOFF_SEC = 300.0  # matches the escalating-ban window seen in production

_rate_limit_banned_until = 0.0


def _supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _run_gmgn_cli(args: list[str]) -> Optional[dict]:
    global _rate_limit_banned_until
    if time.time() < _rate_limit_banned_until:
        return None
    proc = await asyncio.create_subprocess_exec(
        GMGN_CLI_BIN, *args,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "GMGN_HOME": GMGN_HOME},
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=CLI_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        proc.kill()
        return None
    if proc.returncode != 0:
        text = stderr.decode(errors="ignore").lower()
        if "rate limit" in text or "banned" in text:
            _rate_limit_banned_until = time.time() + RATE_LIMIT_BACKOFF_SEC
            print(f"gmgn-cli rate-limited -- backing off {RATE_LIMIT_BACKOFF_SEC:.0f}s")
        return None
    try:
        return json.loads(stdout.decode())
    except json.JSONDecodeError:
        return None


async def fetch_activity(wallet_address: str) -> list[dict]:
    raw = await _run_gmgn_cli([
        "portfolio", "activity", "--chain", "sol",
        "--wallet", wallet_address, "--limit", str(FETCH_LIMIT),
    ])
    return (raw or {}).get("activities", [])


def score_activity(activities: list[dict]) -> tuple[int, int, list[str]]:
    """Returns (total_trades, atomic_trades, sample_atomic_tx_hashes)."""
    event_types_by_key: dict[tuple[str, str], set[str]] = {}
    for raw in activities:
        tx_hash = raw.get("tx_hash", "")
        token_address = (raw.get("token") or {}).get("address", "")
        key = (tx_hash, token_address)
        event_types_by_key.setdefault(key, set()).add(raw.get("event_type", ""))

    atomic_keys = [k for k, types in event_types_by_key.items() if "buy" in types and "sell" in types]
    total = len(event_types_by_key)
    atomic = len(atomic_keys)
    sample = [tx for tx, _ in atomic_keys[:5]]
    return total, atomic, sample


async def process_one(sb: Client, wallet_address: str) -> None:
    activities = await fetch_activity(wallet_address)
    if not activities:
        sb.table("wallet_scores").update({
            "status": "error",
            "error_message": "Sin actividad on-chain encontrada (o gmgn-cli falló/rate-limited).",
            "completed_at": _now_iso(),
        }).eq("wallet_address", wallet_address).execute()
        return

    total, atomic, sample = score_activity(activities)
    atomic_pct = round(100 * atomic / total, 2) if total else 0.0
    sb.table("wallet_scores").update({
        "status": "done",
        "total_trades": total,
        "atomic_trades": atomic,
        "atomic_pct": atomic_pct,
        "real_alpha_pct": round(100 - atomic_pct, 2),
        "sample_atomic_tx": sample,
        "completed_at": _now_iso(),
    }).eq("wallet_address", wallet_address).execute()


MAX_ITEMS_PER_RUN = 20  # a safety cap, not a target -- keeps one CI run bounded


async def drain_queue_once() -> None:
    """Processes whatever's pending right now, then returns. Meant to be
    invoked on a schedule (GitHub Actions cron every few minutes) rather
    than run as a persistent process -- there's no free always-on host for
    a long-lived poller, but a short scheduled job is free and reuses this
    same code unchanged aside from the loop shape."""
    sb = _supabase()
    processed = 0
    while processed < MAX_ITEMS_PER_RUN:
        result = (
            sb.table("wallet_scores")
            .select("wallet_address")
            .eq("status", "pending")
            .order("requested_at")
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            print(f"Queue empty. Processed {processed} this run.")
            return

        wallet_address = rows[0]["wallet_address"]
        print(f"Scoring {wallet_address}...")
        try:
            await process_one(sb, wallet_address)
        except Exception as exc:  # noqa: BLE001 -- one bad wallet shouldn't kill the run
            print(f"Error scoring {wallet_address}: {exc}")
            sb.table("wallet_scores").update({
                "status": "error", "error_message": str(exc), "completed_at": _now_iso(),
            }).eq("wallet_address", wallet_address).execute()
        processed += 1
        await asyncio.sleep(GMGN_CALL_INTERVAL_SEC)

    print(f"Hit MAX_ITEMS_PER_RUN ({MAX_ITEMS_PER_RUN}) -- rest stays queued for the next scheduled run.")


async def main() -> None:
    """Persistent-loop mode, for running locally during development."""
    print("Eterix Screener worker started (persistent mode).")
    while True:
        await drain_queue_once()
        await asyncio.sleep(POLL_QUEUE_INTERVAL_SEC)


if __name__ == "__main__":
    import sys
    if "--once" in sys.argv:
        asyncio.run(drain_queue_once())
    else:
        asyncio.run(main())
