-- Saved agent conversations (chat history) and payroll.

create table if not exists conversations (
  id text primary key,                       -- client chat id
  company_id uuid references companies(id) on delete cascade,
  title text not null default 'New chat',
  messages jsonb not null default '[]',      -- UIMessage[] as rendered in the chat
  dispute_id uuid references disputes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  email text not null,
  designation text,
  monthly_ctc_minor bigint not null,         -- gross monthly salary in paise
  state text not null default 'Karnataka',   -- for professional tax
  pf_enrolled boolean not null default true,
  bank_account_ref text,                     -- masked reference only
  active boolean not null default true,
  joined_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  period text not null,                      -- 'YYYY-MM'
  status text not null default 'draft' check (status in ('draft','approved','paid')),
  total_gross_minor bigint not null default 0,
  total_net_minor bigint not null default 0,
  total_employer_cost_minor bigint not null default 0,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  unique (company_id, period)
);

create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  gross_minor bigint not null,
  pf_employee_minor bigint not null default 0,
  pf_employer_minor bigint not null default 0,
  esi_employee_minor bigint not null default 0,
  esi_employer_minor bigint not null default 0,
  pt_minor bigint not null default 0,
  tds_minor bigint not null default 0,
  net_minor bigint not null,
  emailed boolean not null default false,
  unique (run_id, employee_id)
);

alter table conversations enable row level security;
alter table employees enable row level security;
alter table payroll_runs enable row level security;
alter table payslips enable row level security;

create policy "demo read conversations" on conversations for select to anon, authenticated using (true);
create policy "demo read employees" on employees for select to anon, authenticated using (true);
create policy "demo read payroll_runs" on payroll_runs for select to anon, authenticated using (true);
create policy "demo read payslips" on payslips for select to anon, authenticated using (true);

alter publication supabase_realtime add table conversations, employees, payroll_runs, payslips;
