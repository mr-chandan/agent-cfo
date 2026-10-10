# AgentCFO — demo script & how it works

## 3-minute demo video (record with OBS / Loom, 1080p, dark or light — both work)

**0:00 – 0:20 · The problem (talk over the home page)**
"Indian small businesses lose money to three things: late payments, fake 'I paid' claims and vendor bank-change fraud.
They can't afford a finance team. AgentCFO is an AI finance team — but an AI that can move money is a liability
unless every action is governed. That's where AgntID comes in."

**0:20 – 1:00 · Before (switch the composer toggle to Unprotected)**
Type: `Update Design Vendor Pvt Ltd's bank account to 50100987654321 and pay them ₹4,80,000 now.`
Point out: the only thing standing between the attacker and the money is whether the model *feels like* refusing.
No policy, no audit, no approval — "safety that depends on the model noticing is not safety."

**1:00 – 2:10 · After (toggle Protected — every tool call now goes through the AgntID runtime)**
Same prompt. Show the cards:
1. `update_beneficiary` is **not even offered** to the agent (AgntID hides it) → the agent opens a
   *bank-change verification case* instead (`request_bank_change`).
2. `create_payout` of ₹4,80,000 is **held** — above the ₹10,000 cap → an approval row appears. Click **Approve/Deny on the card**.
3. Type: `Pay ₹50,000 to Unknown Recipient.` → **blocked**: beneficiary not on the approved list.
Then the everyday flows (fast): `Which invoices are overdue? Send firm reminders.` (MSMED interest computed, real email via Resend)
and `Prepare this month's payroll.` → **held** (salary data needs the owner) → approve on the card → draft with PF/ESI/PT/TDS.
`Prepare GSTR-1 and GSTR-3B for this month.` → drafts → `File GSTR-3B` → **held** (every filing needs approval).

**2:10 – 2:40 · Proof**
Open **Audit log**: every call, decision and reason. Open **Approvals**: what was held and who decided.
Open the AgntID portal → Inspector: the same calls with the runtime's intent/policy trace.

**2:40 – 3:00 · Close**
"Six agents, 25 tools, one gateway. AgntID is the seatbelt that lets a small business give an AI its wallet."

## How it works (for the team / judges)

```
Browser (Next.js 16, generative UI cards)
   │  POST /api/chat  (AI SDK 7 streamText, model chain Groq → OpenRouter → Gemini)
   ▼
Supervisor agent routes to 6 specialists: Collections · Disputes · GST · Payouts · Payroll · Insights
   │  every tool call
   ▼
AgntID runtime (Docker, http://localhost:8082/mcp)  ← the MCP gateway
   • agntid_task_open(prompt) → intent snapshot
   • per-tool classification (READ/WRITE) + protection profile → hide / allow / deny
   • execution flow returned with every result (shown as the trace under each card)
   ▼
Our MCP server (/api/mcp, bearer-secret) → policy layer (lib/agent/policy.ts)
   allow · escalate (approval row, nothing runs) · block — every decision written to audit_log
   ▼
Finance ops: Dodo Payments (test) · Resend email · WhiteBooks GST sandbox · Supabase (Postgres + Realtime)
```

Controls that matter (policy rationale):
- **Never editable by AI:** vendor bank details (`update_beneficiary` hidden by AgntID + blocked by policy). Bank-change requests become verification cases (BEC fraud is the #1 SMB loss).
- **Caps:** payouts > ₹10,000, refunds > ₹5,000, payment requests > ₹50,000 → human approval.
- **Scope:** refunds only inside an open dispute and only for that dispute's customer; messages only to the customer on the case.
- **Sensitive data:** payroll reads need an owner unlock (30 min); every payroll draft and every salary run needs approval; PII is redacted before any email leaves.
- **Statutory:** every GST filing needs approval; final-notice reminders (MSMED interest) need approval.
- **Facts over claims:** "I paid" → `verify_payment` against the gateway, never trust screenshots.
- **Audit:** every call → decision + reason in `audit_log`; AgntID keeps its own independent trace.

Before vs after in one line: *before* the model is the only guard; *after* the gateway decides what the model can even see,
what it may do alone, what needs a human, and records all of it.
