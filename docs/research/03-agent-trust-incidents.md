# AI agents + money: incidents, concerns, guardrail gaps (research, 2026-10-10)

## Incidents
1. **Air Canada chatbot (Feb 2024)** — invented a bereavement refund policy; tribunal held the airline liable (2024 BCCRT 149).
2. **Freysa (Nov 2024)** — agent whose only rule was "never approveTransfer" was talked into paying ~$47K.
3. **GitHub MCP prompt injection (Invariant Labs, May 2025)** — malicious issue made an agent leak private repo data.
4. **EchoLeak, M365 Copilot (CVE-2025-32711, Jun 2025, CVSS 9.3)** — zero-click exfiltration via one email.
5. **Anthropic Project Vend (Jun 2025)** — talked into discounts, sold below cost, invented a payment account.
6. **Replit agent (Jul 2025)** — deleted a production DB despite a "no changes without approval" instruction.
7. **Guardio "Scamlexity" (Aug 2025)** — agentic browser auto-paid on a fake shop.
8. **ForcedLeak, Salesforce Agentforce (Sep 2025, CVSS 9.4)** — prompt in a web form leaked CRM data.
9. **In the wild (2026)** — Unit 42 (Mar 2026) hidden prompts pushing unauthorised transactions; Zscaler (Jul 2026)
   active campaigns causing unauthorised agent payments with losses.

## Practitioner concerns (HN)
- Safety must not depend on the model recognising the attack.
- Agents must not be able to change their own limits.
- Irreversible spend needs propose → human approve → backend executes.
- Per-transaction approval doesn't scale; pre-authorise classes of actions.
- No visibility into what agents spend.

## Guardrail gaps
- Stripe agent keys: approval rules exist but Stripe-only; no intent check, no parameter/amount limits, no cross-tool context.
- Visa/Mastercard agentic tokens: card-rail only (no refunds, payouts, GST, email).
- MCP OAuth: authenticates the caller; doesn't decide whether a specific call with specific args should run.
- OWASP Agentic Top 10 (2026): ASI01 goal hijack, ASI02 tool misuse within granted permissions, ASI03 privilege abuse.
- Prompt-level rules fail (Willison "lethal trifecta"; Replit; Freysa).

## Regulation
RBI FREE-AI (Aug 2025, auditability/liability); NPCI UPI-in-ChatGPT pilot built on pre-set limits & revocation;
DPDP Rules (obligations from ~May 2027); EU AI Act logging/human-oversight (high-risk dates moved to Dec 2027).

## Demo scenarios
1. **Poisoned vendor email → payout / bank change** (EchoLeak, ForcedLeak, Zscaler 2026): blocked by intent check,
   beneficiary allowlist, amount limit; bank change becomes a verification case.
2. **Customer talks agent into a big refund** (Air Canada, Project Vend): parameter limit + human approval.
3. **Tool-output injection → data exfil + duplicate retries** (GitHub MCP, Freysa): recipient policy, idempotency,
   grouped approvals, full audit trail.
