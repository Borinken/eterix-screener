create index if not exists scan_requests_ip_date_idx on scan_requests (requester_ip, created_at);
