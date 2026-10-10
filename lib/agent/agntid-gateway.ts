import { createMCPClient } from "@ai-sdk/mcp";
import { jsonSchema, type ToolSet } from "ai";

// Talks to the customer-hosted AgntID runtime the way the official AgntID SDK does
// (github.com/AGNTID-AI/agntid-python, src/agntid/task.py + mcp_wrapper.py):
//   1. tools/list            -> only tools allowed by the protection profile + reviews
//   2. agntid_task_open      -> records agent, user and prompt; returns an intent snapshot
//   3. bind only the tools the intent snapshot marks relevant to this prompt
//   4. every tools/call carries `_task_id` so the runtime ties it to the task (intent + policy checks)
//   5. agntid_task_close     -> when the turn ends
const GLUE = new Set(["agntid_task_open", "agntid_task_close", "agntid_delegation_open", "agntid_delegation_close", "agntid_action_update"]);

type Exec = (input: unknown, options: unknown) => Promise<unknown>;
type GatewayTool = { execute?: Exec } & Record<string, unknown>;

export type Gateway = {
  tools: ToolSet;
  taskId: string;
  intent: { prepared: boolean; relevant: string[] };
  close: () => void;
};

function parseTaskOpen(result: unknown) {
  // result is MCP CallToolResult: { content: [{ type: "text", text: "<json>" }] }
  try {
    const text = (result as { content?: { text?: string }[] })?.content?.[0]?.text ?? "{}";
    const j = JSON.parse(text) as { ok?: boolean; reason?: string; intent?: { prepared?: boolean; snapshot?: { relevant_tool_ids?: string[]; relevant_tool_names?: string[] } } };
    const snap = j.intent?.snapshot;
    const relevant = (snap?.relevant_tool_names?.length ? snap.relevant_tool_names : snap?.relevant_tool_ids ?? []).map((id) => id.replace(/\./g, "_"));
    return { ok: j.ok !== false, reason: j.reason ?? "", prepared: j.intent?.prepared === true, relevant };
  } catch {
    return { ok: true, reason: "", prepared: false, relevant: [] as string[] };
  }
}

export async function openGateway(opts: {
  url: string;
  key?: string;
  prompt: string;
  userId: string;
  agentId?: string;
  disputeId?: string;
}): Promise<Gateway> {
  const mcp = await createMCPClient({
    transport: { type: "http", url: opts.url, headers: opts.key ? { Authorization: `Bearer ${opts.key}` } : undefined },
  });
  const all = (await mcp.tools()) as unknown as Record<string, GatewayTool>;
  const taskId = crypto.randomUUID();
  const callOpts = { toolCallId: `task-${taskId}`, messages: [] };

  const open = all.agntid_task_open?.execute;
  let intent = { prepared: false, relevant: [] as string[] };
  if (open) {
    const res = parseTaskOpen(await open({ task_id: taskId, agent_id: opts.agentId ?? "agent-cfo", user_id: opts.userId, prompt: opts.prompt }, callOpts));
    if (!res.ok) {
      await mcp.close().catch(() => {});
      throw new Error(`AgntID rejected the task: ${res.reason || "unknown reason"}`);
    }
    intent = { prepared: res.prepared, relevant: res.relevant };
  }

  const visible = Object.entries(all).filter(([name]) => !GLUE.has(name));
  // prompt-aware binding: give the model only the tools relevant to this request (fall back to all visible)
  const bound = intent.prepared && intent.relevant.length ? visible.filter(([name]) => intent.relevant.includes(name)) : visible;

  const tools: Record<string, GatewayTool> = {};
  for (const [name, t] of bound) {
    const exec = t.execute;
    // The model never fills disputeId (strict providers reject null for it); we inject the active case ourselves.
    const raw = (t.inputSchema as { jsonSchema?: { properties?: Record<string, unknown>; required?: string[] } } | undefined)?.jsonSchema;
    let inputSchema = t.inputSchema;
    if (raw?.properties) {
      const { disputeId: _omit, ...rest } = raw.properties;
      void _omit;
      const required = (raw.required ?? []).filter((r) => r !== "disputeId");
      // Some providers (Groq) send `null` for optional fields and validate strictly, so the schema the
      // MODEL sees accepts null on optional fields; nulls are stripped before the call reaches AgntID.
      const properties = Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [k, required.includes(k) ? v : { anyOf: [v, { type: "null" }] }]),
      );
      inputSchema = jsonSchema({ ...raw, properties, required } as never);
    }
    tools[name] = {
      ...t,
      inputSchema,
      execute: exec
        ? (input: unknown, o: unknown) => {
            const clean = Object.fromEntries(Object.entries((input ?? {}) as object).filter(([, v]) => v !== null && v !== ""));
            return exec({ ...clean, ...(opts.disputeId ? { disputeId: opts.disputeId } : {}), _task_id: taskId }, o);
          }
        : undefined,
    };
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    const c = all.agntid_task_close?.execute;
    void (c ? c({ task_id: taskId }, callOpts) : Promise.resolve())
      .catch(() => {})
      .finally(() => void mcp.close().catch(() => {}));
  };

  return { tools: tools as unknown as ToolSet, taskId, intent, close };
}
