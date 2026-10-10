// Shared (client-safe): which specialist agent owns each tool.
export type AgentName = "Collections" | "Disputes" | "GST" | "Payouts" | "Payroll" | "Insights";

// Which specialist agent owns each tool (shown in the UI and sent to AgntID as the acting agent).
export const TOOL_AGENT: Record<string, AgentName> = {
  add_customer: "Collections",
  find_customer: "Collections",
  request_payment: "Collections",
  list_overdue_invoices: "Collections",
  send_payment_reminder: "Collections",
  verify_payment: "Collections",
  list_customer_orders: "Collections",
  get_order: "Collections",
  list_disputes: "Disputes",
  issue_refund: "Disputes",
  build_evidence_pack: "Disputes",
  send_message: "Disputes",
  gst_estimate: "GST",
  gst_taxpayer_lookup: "GST",
  gst_ledger_balance: "GST",
  prepare_gstr1: "GST",
  prepare_gstr3b: "GST",
  file_gst_return: "GST",
  list_beneficiaries: "Payouts",
  create_payout: "Payouts",
  update_beneficiary: "Payouts",
  request_bank_change: "Payouts",
  finance_summary: "Insights",
  add_employee: "Payroll",
  list_employees: "Payroll",
  prepare_payroll: "Payroll",
  run_payroll: "Payroll",
};
