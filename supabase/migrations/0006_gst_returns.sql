-- Monthly GST return drafts (GSTR-1 / GSTR-3B) prepared by the agent; filing needs owner approval.
create table if not exists gst_returns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  period text not null, -- YYYY-MM
  form text not null check (form in ('GSTR1','GSTR3B')),
  status text not null default 'draft' check (status in ('draft','filed','portal_error')),
  summary jsonb not null default '{}',
  payload jsonb not null default '{}',
  portal_response jsonb,
  created_at timestamptz default now(),
  filed_at timestamptz,
  unique (company_id, period, form)
);

alter table gst_returns enable row level security;
drop policy if exists "demo read gst_returns" on gst_returns;
create policy "demo read gst_returns" on gst_returns for select to anon, authenticated using (true);

do $$ begin
  alter publication supabase_realtime add table gst_returns;
exception when duplicate_object then null;
end $$;
