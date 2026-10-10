-- DEMO ONLY: lets the browser (anon key) read dashboard tables so Realtime works without login.
-- Writes still go through the server (service role). Replace with per-company policies once auth exists.
create policy "demo read disputes" on disputes for select to anon, authenticated using (true);
create policy "demo read approvals" on approvals for select to anon, authenticated using (true);
create policy "demo read audit_log" on audit_log for select to anon, authenticated using (true);
create policy "demo read messages" on messages for select to anon, authenticated using (true);
create policy "demo read customers" on customers for select to anon, authenticated using (true);
create policy "demo read orders" on orders for select to anon, authenticated using (true);
create policy "demo read payments" on payments for select to anon, authenticated using (true);
