import { createClient } from "@supabase/supabase-js";

// Server-side only: uses the service role key, so this file must never be
// imported from a "use client" component.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type WalletScoreRow = {
  wallet_address: string;
  chain: string;
  status: "pending" | "done" | "error";
  total_trades: number | null;
  atomic_trades: number | null;
  atomic_pct: number | null;
  real_alpha_pct: number | null;
  sample_atomic_tx: string[] | null;
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
};

// Solana addresses are base58, 32-44 chars. This is a shape check, not a
// full base58/curve validation -- good enough to reject junk before it hits
// the queue.
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isLikelySolanaAddress(value: string): boolean {
  return SOLANA_ADDRESS_RE.test(value.trim());
}
