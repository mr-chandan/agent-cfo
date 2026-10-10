-- Demo data (fixed ids so the demo is repeatable). Safe to re-run.
insert into companies (id, name) values ('00000000-0000-0000-0000-00000000c001', 'Acme Studio')
on conflict (id) do nothing;

insert into customers (id, company_id, name, email) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-00000000c001', 'Priya Sharma', 'delivered+priya@resend.dev'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-00000000c001', 'Rahul Verma', 'delivered+rahul@resend.dev')
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

-- spread demo history over the last days so charts look realistic (idempotent: fixed offsets)
update orders set created_at = now() - interval '9 days' where id = '00000000-0000-0000-0000-0000000b0001';
update orders set created_at = now() - interval '6 days' where id = '00000000-0000-0000-0000-0000000b0002';
update orders set created_at = now() - interval '3 days' where id = '00000000-0000-0000-0000-0000000b0003';
update orders set created_at = now() - interval '1 days' where id = '00000000-0000-0000-0000-0000000b0004';
update payments set created_at = o.created_at from orders o where payments.order_id = o.id and payments.kind = 'charge' and o.external_id like 'ord_demo_%';
update customers set created_at = now() - interval '12 days' where id in ('00000000-0000-0000-0000-0000000a0001','00000000-0000-0000-0000-0000000a0002');
