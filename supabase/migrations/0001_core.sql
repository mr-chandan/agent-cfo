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
