import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only. Uses the service-role key, which bypasses RLS. Never import from client code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: SupabaseClient<any> | null = null;

export function admin() {
  client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  return client;
}
