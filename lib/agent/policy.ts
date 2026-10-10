// Runtime access-control decision for every tool call.
// This is the single seam where AgntID plugs in: replace `localDecide` with a call to the
// AgntID runtime and keep the same Decision shape.
export type Decision = { decision: "allow" | "block" | "escalate"; reason: string };

export type PolicyCtx = {
  enforce: boolean; // false = "before AgntID" demo mode
  activeCustomerId?: string; // customer attached to the open dispute (undefined = no case open)
};

export const REFUND_LIMIT_MINOR = Number(process.env.REFUND_LIMIT_MINOR ?? 500_000); // 5,000.00
export const PAYOUT_CAP_MINOR = Number(process.env.PAYOUT_CAP_MINOR ?? 1_000_000); // 10,000.00
export const PAYMENT_REQUEST_CAP_MINOR = Number(process.env.PAYMENT_REQUEST_CAP_MINOR ?? 5_000_000); // 50,000.00

export type ToolFacts = {
  // resolved by the tool layer from the DB so policy decides on facts, not on model claims
  customerId?: string;
  beneficiaryApproved?: boolean;
  payrollUnlocked?: boolean; // owner approved a list_employees call in the last 30 minutes
};

const READ_TOOLS = new Set([
  "get_order",
  "list_customer_orders",
  "find_customer",
  "list_disputes",
  "finance_summary",
  "gst_estimate",
  "gst_taxpayer_lookup",
  "gst_ledger_balance",
  "prepare_gstr1",
  "prepare_gstr3b",
  "list_overdue_invoices",
  "verify_payment",
  "list_beneficiaries",
  "build_evidence_pack",
]);

export function localDecide(
  tool: string,
  input: Record<string, unknown>,
  facts: ToolFacts,
  ctx: PolicyCtx,
): Decision {
  if (!ctx.enforce) return { decision: "allow", reason: "enforcement off (no AgntID)" };

  const hasCase = Boolean(ctx.activeCustomerId);
  const sameCustomer = !facts.customerId || facts.customerId === ctx.activeCustomerId;
  const wrongCustomer = {
    decision: "block" as const,
    reason: "resource belongs to a different customer than the active case",
  };

  switch (tool) {
    case "update_beneficiary":
      return { decision: "block", reason: "payout/bank details are never editable by this agent" };

    case "get_order":
    case "list_customer_orders":
      if (!hasCase) return { decision: "allow", reason: "read-only lookup, no case open" };
      return sameCustomer
        ? { decision: "allow", reason: "resource belongs to the customer on the active case" }
        : wrongCustomer;

    case "send_message":
      if (!hasCase) return { decision: "allow", reason: "message to a customer on file; sensitive data is redacted" };
      return sameCustomer
        ? { decision: "allow", reason: "message goes to the customer on the active case; sensitive data is redacted" }
        : wrongCustomer;

    case "send_payment_reminder":
      return input.tone === "final"
        ? { decision: "escalate", reason: "a final notice citing MSMED interest is a legal escalation; the owner approves it" }
        : { decision: "allow", reason: "routine reminder to a customer on file" };

    case "run_payroll":
      return { decision: "escalate", reason: "salary disbursal moves money to every employee; the owner approves each payroll run" };

    case "prepare_payroll":
      return { decision: "escalate", reason: "drafting payroll reads every salary and computes statutory deductions; the owner approves each draft" };

    case "list_employees":
      return facts.payrollUnlocked
        ? { decision: "allow", reason: "owner unlocked payroll data in the last 30 minutes" }
        : { decision: "escalate", reason: "salary data is sensitive; the owner unlocks payroll reads for 30 minutes" };

    case "add_employee":
      return { decision: "allow", reason: "adding an employee record moves no money; payroll still needs approval" };

    case "add_customer":
      return { decision: "allow", reason: "adding a customer record changes no money" };

    case "request_bank_change":
      return { decision: "allow", reason: "opens a verification case only; the bank account itself is never changed by the agent" };

    case "request_payment": {
      if (hasCase && !sameCustomer) return wrongCustomer;
      const amount = Number(input.amountMinor);
      return amount > PAYMENT_REQUEST_CAP_MINOR
        ? { decision: "escalate", reason: `payment request above ${PAYMENT_REQUEST_CAP_MINOR / 100} needs human approval` }
        : { decision: "allow", reason: "payment request within limit" };
    }

    case "issue_refund": {
      if (!hasCase) return { decision: "block", reason: "refunds need an open dispute so the agent knows which customer it may refund" };
      if (!sameCustomer) return wrongCustomer;
      const amount = Number(input.amountMinor);
      return amount > REFUND_LIMIT_MINOR
        ? { decision: "escalate", reason: `refund above limit (${REFUND_LIMIT_MINOR / 100}) needs human approval` }
        : { decision: "allow", reason: "refund within limit" };
    }

    case "file_gst_return":
      return { decision: "escalate", reason: "a GST return is a statutory filing with the government; the owner approves every filing" };

    case "create_payout": {
      if (!facts.beneficiaryApproved)
        return { decision: "block", reason: "beneficiary is not on the approved list" };
      const amount = Number(input.amountMinor);
      return amount > PAYOUT_CAP_MINOR
        ? { decision: "escalate", reason: `payout above cap (${PAYOUT_CAP_MINOR / 100}) needs human approval` }
        : { decision: "allow", reason: "payout to approved beneficiary within cap" };
    }

    default:
      return READ_TOOLS.has(tool)
        ? { decision: "allow", reason: "read-only tool" }
        : { decision: "block", reason: "unknown tool: denied by default" };
  }
}

export async function decide(
  tool: string,
  input: Record<string, unknown>,
  facts: ToolFacts,
  ctx: PolicyCtx,
): Promise<Decision> {
  return localDecide(tool, input, facts, ctx);
}
