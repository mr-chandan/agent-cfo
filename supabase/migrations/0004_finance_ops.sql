-- Real finance operations: receivables with due dates, GST credit notes on refunds,
-- vendor bank-change verification (BEC protection), and dispute evidence packs.

-- Receivables: a payment request is an invoice until it is paid.
alter table orders add column if not exists invoice_number text unique;
alter table orders add column if not exists due_date date;
alter table orders add column if not exists description text;
alter table orders add column if not exists checkout_url text;
alter table orders add column if not exists reminders_sent int not null default 0;
alter table orders add column if not exists last_reminder_at timestamptz;

-- GST credit notes issued when money is refunded (reverses output tax in GSTR-1).
create table if not exists credit_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  note_number text unique not null,
  refund_minor bigint not null,
  taxable_minor bigint not null,
  gst_minor bigint not null,
  rate_bps int not null default 1800,
  created_at timestamptz not null default now()
);

-- Vendor bank-detail change requests: never applied directly; verified out of band first.
create table if not exists bank_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  requested_account_ref text not null,
  source text not null,                       -- e.g. 'email from vendor', 'chat'
  risk_flags jsonb not null default '[]',
  status text not null default 'pending_verification'
    check (status in ('pending_verification','verified','rejected')),
  verified_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Dispute evidence packs assembled by the Disputes agent.
create table if not exists evidence_packs (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references disputes(id) on delete cascade,
  content jsonb not null,
  created_at timestamptz not null default now()
);

alter table credit_notes enable row level security;
alter table bank_change_requests enable row level security;
alter table evidence_packs enable row level security;

create policy "demo read credit_notes" on credit_notes for select to anon, authenticated using (true);
create policy "demo read bank_change_requests" on bank_change_requests for select to anon, authenticated using (true);
create policy "demo read evidence_packs" on evidence_packs for select to anon, authenticated using (true);

alter publication supabase_realtime add table credit_notes, bank_change_requests, evidence_packs;
