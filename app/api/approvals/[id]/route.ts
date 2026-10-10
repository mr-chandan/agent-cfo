import { admin } from "@/lib/supabase-admin";
import { run } from "@/lib/agent/actions";

type Row = Record<string, unknown>;

// A human decides on an escalated tool call. Approving runs the action exactly as proposed.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { approve } = (await req.json()) as { approve?: boolean };
  if (typeof approve !== "boolean") return Response.json({ error: "approve (boolean) required" }, { status: 400 });

  const db = admin();
  // atomic claim: only a still-pending approval can be decided, and only once
  const { data: claimed } = await db
    .from("approvals")
    .update({ status: approve ? "approved" : "denied", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (!claimed) return Response.json({ error: "approval not found or already decided" }, { status: 409 });

  const a = claimed as Row;
  let result: unknown = null;
  let error: string | null = null;

  if (approve) {
    try {
      result = await run(a.tool as string, a.input as Row);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  await db.from("audit_log").insert({
    company_id: a.company_id ?? null,
    dispute_id: a.dispute_id ?? null,
    agent: "human",
    tool: a.tool,
    input: a.input,
    decision: error ? "error" : approve ? "allow" : "block",
    reason: error ?? (approve ? "human approved escalated action" : "human denied escalated action"),
  });

  return Response.json({ status: approve ? "approved" : "denied", result, error });
}
