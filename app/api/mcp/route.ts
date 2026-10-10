import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { admin } from "@/lib/supabase-admin";
import { guarded, TOOL_SPECS, type AgentCtx } from "@/lib/agent/tools";

// MCP server exposing the finance tools. AgntID's gateway is registered in front of this URL:
// the agent talks to AgntID, AgntID enforces its policies, then forwards allowed calls here.
// Local rules still run as a second layer (set MCP_LOCAL_ENFORCE=false to rely on AgntID alone).

function authorized(req: Request) {
  const secret = process.env.MCP_SHARED_SECRET;
  if (!secret) return false; // refuse to serve unauthenticated
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-api-key") ?? "";
  const supplied = header || new URL(req.url).searchParams.get("key") || "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function contextFor(disputeId: string | undefined, origin: string): Promise<AgentCtx> {
  const ctx: AgentCtx = { enforce: process.env.MCP_LOCAL_ENFORCE !== "false", origin };
  if (disputeId) {
    // customer + company are resolved from the DB, never taken from the caller
    const { data } = await admin().from("disputes").select("id,company_id,customer_id").eq("id", disputeId).maybeSingle();
    if (data) {
      const d = data as Record<string, string>;
      ctx.disputeId = d.id;
      ctx.companyId = d.company_id;
      ctx.activeCustomerId = d.customer_id;
    }
  }
  return ctx;
}

// Tool sets let one endpoint back several AgntID-registered servers: "ops" carries the operations tools
// (receivables, payout protection, evidence packs) so they get their own catalog, reviews and policies.
const OPS_TOOLS = new Set([
  "add_customer",
  "list_overdue_invoices",
  "send_payment_reminder",
  "verify_payment",
  "list_beneficiaries",
  "request_bank_change",
  "build_evidence_pack",
  "finance_summary",
]);

function buildServer(origin: string, set: string | null) {
  const server = new McpServer({ name: set === "ops" ? "agent-cfo-ops" : "agent-cfo-finance", version: "1.0.0" });
  const specs = set === "ops" ? TOOL_SPECS.filter((t) => OPS_TOOLS.has(t.name)) : TOOL_SPECS;
  for (const s of specs) {
    // Gateways (AgntID) send omitted optional fields as null. Optional fields map null -> undefined before
    // validation, while the advertised JSON schema stays plain (AgntID's catalog rejects ["type","null"] unions).
    // Every tool also accepts the dispute it is working on, so policies can scope to a case.
    const nullToUndefined = (v: unknown) => (v === null || v === "" ? undefined : v);
    const shape: Record<string, z.ZodType> = {};
    for (const [k, f] of Object.entries(s.schema.shape)) {
      const field = f as z.ZodType;
      shape[k] = field.safeParse(undefined).success ? z.preprocess(nullToUndefined, field) : field;
    }
    shape.disputeId = z.preprocess(nullToUndefined, z.string().optional()).describe("Active dispute id, if working a case");
    server.registerTool(s.name, { description: s.description, inputSchema: shape }, async (args: Record<string, unknown>) => {
      const clean = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== null && v !== "" && v !== undefined));
      const { disputeId, ...input } = clean;
      const ctx = await contextFor(disputeId as string | undefined, origin);
      const out = await guarded(ctx, s.name, input, () => s.run(input as never, ctx));
      return {
        content: [{ type: "text" as const, text: JSON.stringify(out) }],
        isError: out.status === "error" || out.status === "blocked",
      };
    });
  }
  return server;
}

async function handle(req: Request) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });
  const url = new URL(req.url);
  const server = buildServer(url.origin + "/", url.searchParams.get("set"));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
