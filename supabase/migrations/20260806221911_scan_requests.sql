create table if not exists scan_requests (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  requester_ip text,
  free boolean not null default true,
  payment_reference text unique,
  payment_signature text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
