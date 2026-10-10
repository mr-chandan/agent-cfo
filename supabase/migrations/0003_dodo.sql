-- Dodo Payments integration support.
alter table orders add column if not exists product_id text;
alter table payments add column if not exists provider text not null default 'demo';
alter table disputes add column if not exists external_id text unique;

-- webhook idempotency + raw event inspection (server-only; RLS on, no policies = no browser access)
create table if not exists webhook_events (
  id text primary key,                 -- webhook-id header
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table webhook_events enable row level security;
