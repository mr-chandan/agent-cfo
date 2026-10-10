import { admin } from "@/lib/supabase-admin";

// Recent conversations for the history list.
export async function GET() {
  const { data } = await admin().from("conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(30);
  return Response.json(data ?? []);
}
