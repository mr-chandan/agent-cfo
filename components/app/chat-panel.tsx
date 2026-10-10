"use client";

import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Building2, History, Mail, Plus, Scale, ShieldAlert, ShieldCheck, Skull, Users, Wallet, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/app/logo";
import { TOOL_LABEL } from "@/components/app/ui-bits";
import { baseToolName, ToolResultCard, type AgntidFlow, type ToolOut } from "@/components/app/tool-cards";

export type Suggestion = { group?: string; text: string };

const GROUP_ICON: Record<string, LucideIcon> = {
  "Collect money": Wallet,
  Customers: Mail,
  GST: Building2,
  Payroll: Users,
  Disputes: Scale,
  "Try to break it": Skull,
};

export type Part = { type: string; state?: string; output?: unknown; errorText?: string; text?: string; toolName?: string };

// Local tools stream as `tool-<name>` parts; tools discovered over MCP (AgntID) stream as `dynamic-tool`.
export const isTool = (p: Part) => p.type.startsWith("tool-") || p.type === "dynamic-tool";
export const toolNameOf = (p: Part) => (p.type === "dynamic-tool" ? (p.toolName ?? "tool") : p.type.slice(5));

// Local tools return the object directly; tools reached over MCP (AgntID) wrap it as text content,
// and an AgntID runtime denial arrives as a tool error.
export function normalize(p: Part): ToolOut | undefined {
  if (p.state === "output-error") {
    const msg = p.errorText ?? "Tool failed";
    const denied = /policy|denied|not permitted|agntid/i.test(msg);
    return { status: denied ? "blocked" : "error", reason: msg.replace(/^.*?Policy denied:\s*/i, "Policy denied: "), enforcedBy: denied ? "agntid" : undefined };
  }
  const raw = p.output;
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as { content?: { text?: string }[]; isError?: boolean } & ToolOut;
  if (Array.isArray(o.content) && o.content[0]?.text !== undefined) {
    const text = o.content[0].text ?? "";
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      return o.isError ? { status: "blocked", reason: text, enforcedBy: "agntid" } : { status: "done", result: { text } };
    }
    // AgntID runtime envelope: { __agntid_execution_flow, __agntid_result }
    const flow = parsed?.__agntid_execution_flow as AgntidFlow | undefined;
    if (flow) {
      const inner = parsed?.__agntid_result;
      let res: ToolOut | undefined;
      if (typeof inner === "string") {
        try {
          res = JSON.parse(inner) as ToolOut;
        } catch {
          res = { status: /error/i.test(inner) ? "error" : "done", reason: inner, result: { text: inner } };
        }
      } else if (inner && typeof inner === "object") {
        res = inner as ToolOut;
      }
      const deniedStep = flow.steps?.find((st) => /fail|denied|block/i.test(st.status));
      if (deniedStep || /denied|blocked/i.test(flow.status ?? "")) {
        const why = (deniedStep?.details as { reason?: string; verdict_reason?: string } | undefined);
        return { status: "blocked", reason: why?.reason ?? why?.verdict_reason ?? `AgntID ${deniedStep?.step?.replace(/_/g, " ") ?? "policy"} denied this call`, enforcedBy: "agntid", agntid: flow };
      }
      return { ...(res ?? { status: "done" }), enforcedBy: "agntid", agntid: flow };
    }
    return { ...(parsed as ToolOut), enforcedBy: "local" };
  }
  return o;
}

type ChatProps = {
  disputeId?: string;
  suggestions: Suggestion[];
  className?: string;
  title?: string;
  intro?: string;
};

// Owns which conversation is open; remounts the chat when you switch or start a new one.
export function ChatPanel(props: ChatProps) {
  const [session, setSession] = useState<{ id: string; messages: UIMessage[] }>(() => ({ id: crypto.randomUUID(), messages: [] }));
  const open = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const c = (await res.json()) as { id: string; messages: UIMessage[] };
    setSession({ id: c.id, messages: c.messages ?? [] });
  }, []);
  return (
    <ChatSession
      key={session.id}
      {...props}
      chatId={session.id}
      initialMessages={session.messages}
      onNew={() => setSession({ id: crypto.randomUUID(), messages: [] })}
      onOpen={open}
    />
  );
}

function HistoryMenu({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [items, setItems] = useState<{ id: string; title: string; updated_at: string }[]>([]);
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={onNew}>
        <Plus className="size-3.5" /> New chat
      </Button>
      <DropdownMenu onOpenChange={(o) => o && fetch("/api/conversations").then((r) => r.json()).then(setItems).catch(() => {})}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 gap-1.5">
            <History className="size-3.5" /> History
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel>Past conversations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.length === 0 && <p className="text-muted-foreground px-2 py-3 text-sm">No saved conversations yet.</p>}
          {items.map((c) => (
            <DropdownMenuItem key={c.id} onSelect={() => onOpen(c.id)} className="flex flex-col items-start gap-0">
              <span className="line-clamp-1 text-sm">{c.title}</span>
              <span className="text-muted-foreground text-[11px]">
                {new Date(c.updated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ChatSession({
  chatId,
  initialMessages,
  onNew,
  onOpen,
  disputeId,
  suggestions,
  className,
  title = "Agent CFO",
  intro = "Collect, chase, refund, pay salaries, check GST. Every action is checked before it runs.",
}: ChatProps & { chatId: string; initialMessages: UIMessage[]; onNew: () => void; onOpen: (id: string) => void }) {
  const [input, setInput] = useState("");
  const [protectedMode, setProtectedMode] = useState(true);
  const { messages, sendMessage, status, error } = useChat({ id: chatId, messages: initialMessages });
  const busy = status === "streaming" || status === "submitted";
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text }, { body: { disputeId, enforce: protectedMode } });
    setInput("");
  }

  // what the agent is doing right now, in plain words
  const last = messages[messages.length - 1];
  const runningTool = last?.role === "assistant"
    ? (last.parts as Part[]).filter((p) => isTool(p) && !p.output && p.state !== "output-error").pop()
    : undefined;
  const statusLine = !busy ? null : runningTool ? `${TOOL_LABEL[baseToolName(toolNameOf(runningTool))] ?? baseToolName(toolNameOf(runningTool))}…` : status === "submitted" ? "Reading your request…" : "Writing the answer…";

  const groups = [...new Set(suggestions.map((s) => s.group ?? ""))];

  return (
    <div className={cn("bg-card flex min-h-0 flex-col overflow-hidden rounded-xl border shadow-xs", className)}>
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Logo className="size-7" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-muted-foreground text-[11px]">{busy ? "Working…" : "Ready"}</div>
          </div>
          <div className="ml-2 hidden sm:block">
            <HistoryMenu onOpen={onOpen} onNew={onNew} />
          </div>
        </div>
        <label className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs", protectedMode ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40")}>
          {protectedMode ? <ShieldCheck className="size-3.5 text-emerald-600" /> : <ShieldAlert className="size-3.5 text-red-600" />}
          <span className={cn("font-medium", protectedMode ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
            Access control {protectedMode ? "on" : "off"}
          </span>
          <Switch checked={protectedMode} onCheckedChange={setProtectedMode} className="scale-90" />
        </label>
      </div>

      {/* conversation */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
            <div>
              <Logo className="size-11" />
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">What should I take care of?</h2>
              <p className="text-muted-foreground mt-1.5 text-sm">{intro}</p>
            </div>
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {groups.map((g) => {
                const Icon = GROUP_ICON[g] ?? Wallet;
                const items = suggestions.filter((s) => (s.group ?? "") === g);
                const risky = g === "Try to break it";
                return (
                  <div key={g}>
                    <div className={cn("mb-2 flex items-center gap-1.5 text-xs font-medium", risky ? "text-destructive" : "text-primary")}>
                      <Icon className="size-3.5" />
                      {g || "Try"}
                    </div>
                    <ul className="space-y-1">
                      {items.map((s) => (
                        <li key={s.text}>
                          <button onClick={() => send(s.text)} className="hover:bg-muted -mx-2 w-[calc(100%+1rem)] rounded-md px-2 py-1.5 text-left text-sm leading-snug transition-colors">
                            {s.text}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-md px-4 py-2 text-sm whitespace-pre-wrap">
                    {(m.parts as Part[]).filter((p) => p.type === "text").map((p) => p.text).join("")}
                  </div>
                </div>
              ) : (
                <AssistantMessage key={m.id} parts={m.parts as Part[]} done={!(busy && m.id === last?.id)} />
              ),
            )}
            {busy && last?.role === "user" && <ThinkingRow label="Reading your request…" />}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                Something went wrong: {error.message}
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* composer */}
      <div className="border-t p-3">
        {statusLine && (
          <div className="text-muted-foreground mb-2 flex items-center gap-2 px-1 text-xs">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            {statusLine}
          </div>
        )}
        <form
          className="bg-background focus-within:ring-ring/30 flex items-end gap-2 rounded-xl border p-2 focus-within:ring-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask anything about your money…"
            rows={1}
            className="max-h-40 min-h-9 resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="icon" className="shrink-0 rounded-lg" disabled={busy || !input.trim()}>
            <ArrowUp className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

export function ThinkingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <Logo className="size-7" />
      <div className="text-muted-foreground flex items-center gap-1 text-sm">
        {label}
        <span className="inline-flex gap-0.5">
          <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
          <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
          <span className="size-1 animate-bounce rounded-full bg-current" />
        </span>
      </div>
    </div>
  );
}

export function AssistantMessage({ parts, done }: { parts: Part[]; done: boolean }) {
  const toolParts = parts.filter(isTool);
  const textParts = parts.filter((p) => p.type === "text" && p.text?.trim());
  const blocked = toolParts.filter((p) => normalize(p)?.status === "blocked").length;
  const approvals = toolParts.filter((p) => normalize(p)?.status === "pending_approval").length;

  return (
    <div className="flex gap-3">
      <Logo className="mt-0.5 size-7" />
      <div className="min-w-0 flex-1 space-y-3">
        {toolParts.length > 0 && (
          <div className="relative space-y-2 pl-4 before:absolute before:top-2 before:bottom-2 before:left-1 before:w-px before:bg-border">
            <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              {toolParts.length} step{toolParts.length > 1 ? "s" : ""}
              {blocked ? ` · ${blocked} blocked` : ""}
              {approvals ? ` · ${approvals} awaiting approval` : ""}
            </div>
            {toolParts.map((p, i) => (
              <div key={i} className="relative">
                <span className={cn("absolute top-3 -left-[14px] size-2 rounded-full ring-2 ring-card", dot(normalize(p)?.status))} />
                <ToolResultCard name={toolNameOf(p)} out={normalize(p)} />
              </div>
            ))}
          </div>
        )}
        {textParts.map((p, i) => (
          <div key={i} className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_a]:text-emerald-700 [&_a]:underline [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}>
              {p.text ?? ""}
            </ReactMarkdown>
          </div>
        ))}
        {done && textParts.length === 0 && toolParts.length > 0 && (
          <p className="text-muted-foreground text-xs italic">The agent finished these steps without a written summary. Ask “what did you do?” to get one.</p>
        )}
      </div>
    </div>
  );
}

function dot(status?: string) {
  if (status === "blocked") return "bg-red-500";
  if (status === "pending_approval") return "bg-amber-500";
  if (status === "error") return "bg-zinc-400";
  if (status === "done") return "bg-emerald-500";
  return "bg-muted-foreground/40 animate-pulse";
}
