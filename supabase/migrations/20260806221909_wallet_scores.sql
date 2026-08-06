create table if not exists wallet_scores (
  wallet_address text primary key,
  chain text not null default 'sol',
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  total_trades int,
  atomic_trades int,
  atomic_pct numeric,
  real_alpha_pct numeric,
  sample_atomic_tx text[],
  error_message text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
