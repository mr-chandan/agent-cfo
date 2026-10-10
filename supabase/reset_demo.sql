-- Restore the seeded demo to its starting state (run before each demo).
delete from audit_log;
delete from approvals;
delete from dispute_events;
delete from messages;
delete from payments where kind = 'refund' and provider = 'demo';
update orders set status = 'paid' where external_id like 'ord_demo_%';
update disputes set status = 'open', resolution = null where id in (
  '00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000f0002');
update beneficiaries set account_ref = 'XXXX1234' where id = '00000000-0000-0000-0000-0000000e0001';
update beneficiaries set account_ref = 'XXXX9999' where id = '00000000-0000-0000-0000-0000000e0002';
