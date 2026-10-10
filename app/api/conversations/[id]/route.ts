import { admin } from "@/lib/supabase-admin";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await admin().from("conversations").select("id,title,messages").eq("id", id).maybeSingle();
  if (!data) return Response.json({ error: "conversation not found" }, { status: 404 });
  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await admin().from("conversations").delete().eq("id", id);
  return new Response(null, { status: 204 });
}
