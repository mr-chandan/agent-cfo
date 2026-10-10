-- Core schema for the finance dispute agent. All tables are company-scoped.
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  email text,
  telegram_chat_id text,
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  external_id text unique,            -- Lemon Squeezy order id
  amount_minor bigint not null,       -- minor units (paise/cents)
  currency text not null default 'INR',
  status text not null default 'pending' check (status in ('pending','paid','refunded','partially_refunded','failed')),
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  external_id text unique,
  amount_minor bigint not null,
  currency text not null default 'INR',
  kind text not null default 'charge' check (kind in ('charge','refund')),
  created_at timestamptz not null default now()
);

create table disputes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  channel text not null default 'chat' check (channel in ('chat','email','telegram','whatsapp','webhook')),
  reason text not null,
  status text not null default 'open' check (status in ('open','investigating','awaiting_approval','awaiting_customer','resolved','rejected')),
  resolution text,
  opened_at timestamptz not null default now(),
  due_by timestamptz
);

create table dispute_events (          -- append-only timeline
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references disputes(id) on delete cascade,
  actor text not null,                 -- 'customer' | 'agent' | 'human' | 'system'
  kind text not null,                  -- 'message' | 'tool_call' | 'decision' | 'note'
  body jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  dispute_id uuid references disputes(id) on delete set null,
  channel text not null,
  direction text not null check (direction in ('in','out')),
  body text not null,
  created_at timestamptz not null default now()
);

create table beneficiaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  account_ref text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  dispute_id uuid references disputes(id) on delete set null,
  tool text not null,
  input jsonb not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  dispute_id uuid references disputes(id) on delete set null,
  agent text not null default 'dispute-agent',
  tool text not null,
  input jsonb not null,
  decision text not null check (decision in ('allow','block','escalate','error')),
  reason text,
  created_at timestamptz not null default now()
);

-- RLS on everywhere. The agent/server uses the service-role key (bypasses RLS);
-- browser clients only get read access for authenticated users via policies added with auth.
alter table companies enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table payments enable row level security;
alter table disputes enable row level security;
alter table dispute_events enable row level security;
alter table messages enable row level security;
alter table beneficiaries enable row level security;
alter table approvals enable row level security;
alter table audit_log enable row level security;

-- Realtime for the live dashboard
alter publication supabase_realtime add table disputes, approvals, audit_log, messages, dispute_events, payments, orders;
-- DEMO ONLY: lets the browser (anon key) read dashboard tables so Realtime works without login.
-- Writes still go through the server (service role). Replace with per-company policies once auth exists.
create policy "demo read disputes" on disputes for select to anon, authenticated using (true);
create policy "demo read approvals" on approvals for select to anon, authenticated using (true);
create policy "demo read audit_log" on audit_log for select to anon, authenticated using (true);
create policy "demo read messages" on messages for select to anon, authenticated using (true);
create policy "demo read customers" on customers for select to anon, authenticated using (true);
create policy "demo read orders" on orders for select to anon, authenticated using (true);
create policy "demo read payments" on payments for select to anon, authenticated using (true);
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
-- Demo data (fixed ids so the demo is repeatable). Safe to re-run.
insert into companies (id, name) values ('00000000-0000-0000-0000-00000000c001', 'Acme Studio')
on conflict (id) do nothing;

insert into customers (id, company_id, name, email) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-00000000c001', 'Priya Sharma', 'priya@example.com'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-00000000c001', 'Rahul Verma', 'rahul@example.com')
on conflict (id) do nothing;

insert into orders (id, company_id, customer_id, external_id, amount_minor, currency, status) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000a0001', 'ord_demo_1', 249900, 'INR', 'paid'),
  ('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000a0001', 'ord_demo_2', 249900, 'INR', 'paid'),
  ('00000000-0000-0000-0000-0000000b0003', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000a0001', 'ord_demo_3', 1200000, 'INR', 'paid'),
  ('00000000-0000-0000-0000-0000000b0004', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000a0002', 'ord_demo_4', 499900, 'INR', 'paid')
on conflict (id) do nothing;

insert into payments (id, company_id, order_id, external_id, amount_minor, currency, kind) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000b0001', 'pay_demo_1', 249900, 'INR', 'charge'),
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000b0002', 'pay_demo_2', 249900, 'INR', 'charge'),
  ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000b0003', 'pay_demo_3', 1200000, 'INR', 'charge'),
  ('00000000-0000-0000-0000-0000000d0004', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000b0004', 'pay_demo_4', 499900, 'INR', 'charge')
on conflict (id) do nothing;

insert into beneficiaries (id, company_id, name, account_ref, approved) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000c001', 'Design Vendor Pvt Ltd', 'XXXX1234', true),
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-00000000c001', 'Unknown Recipient', 'XXXX9999', false)
on conflict (id) do nothing;

insert into disputes (id, company_id, customer_id, order_id, channel, reason, status) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000b0002', 'email', 'I was charged twice for the same plan. Please refund the duplicate.', 'open'),
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000b0003', 'telegram', 'The annual plan did not match what was promised. I want my full money back.', 'open')
on conflict (id) do nothing;
