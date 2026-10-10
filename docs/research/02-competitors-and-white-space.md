# Competitors & white space (research, Oct 2026)

Caveat: mostly vendor announcements / trade press; vendor performance claims unverified.

## India
- **Razorpay** — MCP server (Apr 2025); **Agent Studio** (Mar 2026, built on Claude Agent SDK): Dispute Responder,
  abandoned-cart voice, subscription recovery, cashflow forecaster; **RazorpayX** agentic banking (Jun 2026):
  chat-to-payout with OTP approval, receivables reminders. Gap: siloed, Razorpay-rails-only, no GST; merchants
  complain about settlement holds and no human response on disputes.
- **Cashfree** — MCP (PG, Payouts, SecureID), agentic payments / in-chat checkout. Gap: dev infrastructure, not SMB product.
- **Juspay** — MCP analytics, Visa agentic pilot; enterprise.
- **Zoho Books (Zia)** — assistive (drafting, insights), strong GST; not autonomous. Support complaints.
- **TallyPrime (Tally IRA, 7.1)** — first AI (document automation); no payments/disputes.
- **Refrens (FREYA virtual CFO)** — Q&A + reconciliation; doesn't move money.
- **Vyapar / myBillBook / Khatabook** — rule-based WhatsApp/SMS reminders; no agents; sync/support complaints.
- **ClearTax** — income-tax AI on WhatsApp; no GST agent.
- **GSTHero, Vyapar TaxOne** — GST filing/2B matching for CAs; not tied to payments.
- **WhatsApp Business AI (May 2026)** — support/sales; UPI-in-chat "coming soon"; no collections.

## Global
- **Ramp / Brex** — strong policy + audit-trail agents, but spend-only.
- **Intuit QuickBooks agents** — closest multi-agent SMB product (payments agent: late-payer prediction); US-centric.
- **Xero JAX** — auto bank rec; Bill Protection (beta) flags altered bank details; adaptive follow-ups "coming soon".
- **Digits / Puzzle / Rillet / Pennylane** — ledger/bookkeeping agents.
- **Mercury** — agent cards with hard limits; customer bears liability.
- **Stripe Agent Toolkit / MCP** — scoping via restricted keys only; **no server-side approval gate**.
- **AR specialists** — Peakflo, Fazeshift (YC S24), AgentCollect (YC S23); Cifrato (YC W25) for CA firms.

No product found that runs collections + disputes + tax + payouts under one supervisor with a shared policy and
approval layer (India or global).

## White spaces
1. **Unified payments + GST + disputes supervisor for Indian SMBs** — refund/chargeback → automatic GST credit note /
   GSTR-1 adjustment; payout → check vendor GSTIN / 2B filing first. Buyers: D2C/online sellers + their CAs.
2. **WhatsApp-native collections that act** — negotiate part-payments, send UPI link, reconcile, Hindi/regional.
3. **Gateway-agnostic chargeback / settlement-hold evidence packs** — invoice + delivery + chats + GST invoice.
4. **Payout protection against vendor bank-detail changes** — penny-drop name match, GSTIN/PAN cross-check,
   cooling-off, second approver (buildable on Cashfree SecureID).
5. **Auditable approvals for agent money actions** — per-action policy limits, intent checks, maker-checker approval,
   immutable audit log mapped to CA/auditor needs; sellable to SMBs and later as B2B infra.

Main threat: Razorpay velocity. Defensible angle: cross-gateway + GST-linked + one approval layer.
