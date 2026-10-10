// GST return drafts (GSTR-1 / GSTR-3B) built from our own invoices and credit notes, and "filing"
// = saving the draft to the WhiteBooks GST sandbox. Filing is gated by policy (owner approval).
import { admin } from "@/lib/supabase-admin";
import { COMPANY_ID } from "@/lib/agent/finance-ops";
import { gstUser, saveReturn, whitebooksEnabled } from "@/lib/whitebooks";

type Row = Record<string, unknown>;
type Form = "GSTR1" | "GSTR3B";

const RATE = 0.18;
const HSN = "9983";
const stateCd = () => process.env.WHITEBOOKS_STATE_CD_1 ?? "29";
const gstin = () => gstUser(1)?.gstin ?? "";
const rupees = (minor: number) => Math.round(minor) / 100;
const half = (minor: number) => {
  const c = Math.floor(minor / 2);
  return [c, minor - c] as const;
};

function monthRange(period?: string) {
  const p = period ?? new Date().toISOString().slice(0, 7);
  const [y, m] = p.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  const fp = `${String(m).padStart(2, "0")}${y}`; // MMYYYY
  return { period: p, start, end, fp };
}

const ddmmyyyy = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
};

async function existing(period: string, form: Form) {
  const { data } = await admin()
    .from("gst_returns")
    .select("status, summary, payload")
    .eq("company_id", COMPANY_ID)
    .eq("period", period)
    .eq("form", form)
    .maybeSingle();
  return data as Row | null;
}

async function upsertDraft(period: string, form: Form, summary: Row, payload: Row) {
  const { error } = await admin()
    .from("gst_returns")
    .upsert(
      { company_id: COMPANY_ID, period, form, status: "draft", summary, payload, portal_response: null, filed_at: null },
      { onConflict: "company_id,period,form" },
    );
  if (error) throw new Error(`could not save ${form} draft: ${error.message}`);
}

// Outward supplies + credit notes for the month, all GST-inclusive at 18%, intra-state B2C.
async function computeGstr1(period?: string) {
  const r = monthRange(period);
  const db = admin();
  const [{ data: pays, error: pErr }, { data: notes, error: nErr }] = await Promise.all([
    db
      .from("payments")
      .select("order_id, amount_minor, kind, created_at, orders(invoice_number, customer_id)")
      .gte("created_at", r.start)
      .lt("created_at", r.end),
    db
      .from("credit_notes")
      .select("order_id, note_number, refund_minor, taxable_minor, gst_minor, created_at")
      .gte("created_at", r.start)
      .lt("created_at", r.end),
  ]);
  if (pErr) throw new Error(pErr.message);
  if (nErr) throw new Error(nErr.message);

  const charges = ((pays ?? []) as Row[]).filter((p) => p.kind === "charge");
  const gross = charges.reduce((s, p) => s + Number(p.amount_minor ?? 0), 0);
  const taxable = Math.round(gross / (1 + RATE));
  const tax = gross - taxable;
  const [cgst, sgst] = half(tax);

  // Credit notes recorded explicitly, plus refunds that have no credit note for the same order.
  const noted = new Set(((notes ?? []) as Row[]).map((n) => String(n.order_id)));
  const cn = ((notes ?? []) as Row[]).map((n) => ({
    number: String(n.note_number),
    date: String(n.created_at),
    value: Number(n.refund_minor ?? 0),
    taxable: Number(n.taxable_minor ?? 0),
    tax: Number(n.gst_minor ?? 0),
  }));
  for (const p of (pays ?? []) as Row[]) {
    if (p.kind !== "refund" || noted.has(String(p.order_id))) continue;
    const value = Math.abs(Number(p.amount_minor ?? 0));
    const t = Math.round(value / (1 + RATE));
    cn.push({ number: `RF-${String(p.order_id).slice(0, 8)}`, date: String(p.created_at), value, taxable: t, tax: value - t });
  }
  const cnValue = cn.reduce((s, c) => s + c.value, 0);
  const cnTaxable = cn.reduce((s, c) => s + c.taxable, 0);
  const cnTax = cn.reduce((s, c) => s + c.tax, 0);
  const pos = stateCd();

  const summary = {
    period: r.period,
    invoices: charges.length,
    gross_minor: gross,
    taxable_minor: taxable,
    cgst_minor: cgst,
    sgst_minor: sgst,
    igst_minor: 0,
    credit_notes_minor: cnValue,
    credit_notes_taxable_minor: cnTaxable,
    credit_notes_tax_minor: cnTax,
    net_tax_minor: Math.max(0, tax - cnTax),
    sections: [
      { name: "B2CS", count: charges.length, taxable_minor: taxable, tax_minor: tax },
      { name: "CDNUR", count: cn.length, taxable_minor: cnTaxable, tax_minor: cnTax },
      { name: "HSN", hsn: HSN, count: charges.length, taxable_minor: taxable, tax_minor: tax },
    ],
  };

  const payload = {
    gstin: gstin(),
    fp: r.fp,
    gt: rupees(gross),
    cur_gt: rupees(gross),
    b2b: [],
    b2cs: charges.length
      ? [{ sply_ty: "INTRA", rt: 18, typ: "OE", pos, txval: rupees(taxable), camt: rupees(cgst), samt: rupees(sgst), csamt: 0 }]
      : [],
    cdnur: cn.map((c) => {
      const [cc, sc] = half(c.tax);
      return {
        typ: "B2CS",
        ntty: "C",
        nt_num: c.number,
        nt_dt: ddmmyyyy(c.date),
        val: rupees(c.value),
        pos,
        itms: [{ num: 1, itm_det: { rt: 18, txval: rupees(c.taxable), iamt: 0, camt: rupees(cc), samt: rupees(sc), csamt: 0 } }],
      };
    }),
    hsn: {
      data: [
        { num: 1, hsn_sc: HSN, desc: "Services", uqc: "OTH", qty: 0, txval: rupees(taxable), iamt: 0, camt: rupees(cgst), samt: rupees(sgst), csamt: 0, rt: 18 },
      ],
    },
  };
  return { period: r.period, fp: r.fp, summary, payload };
}

export async function prepareGstr1(input: { period?: string } = {}) {
  const { period, summary, payload } = await computeGstr1(input.period);
  const prev = await existing(period, "GSTR1");
  if (prev?.status === "filed") {
    return { form: "GSTR1", period, ...(prev.summary as Row), status: "filed", note: "Already filed for this period; the filed draft was not overwritten." };
  }
  await upsertDraft(period, "GSTR1", summary, payload);
  return { ...summary, form: "GSTR1", period, status: "draft", note: "Draft built from recorded invoices and credit notes. Filing needs owner approval." };
}

export async function prepareGstr3b(input: { period?: string; itcMinor?: number } = {}) {
  const g1 = await computeGstr1(input.period);
  const s = g1.summary;
  const outwardTaxable = Math.max(0, s.taxable_minor - s.credit_notes_taxable_minor);
  const tax = s.net_tax_minor;
  const [cgst, sgst] = half(tax);
  const itc = Math.max(0, Math.round(input.itcMinor ?? 0));
  const [itcC, itcS] = half(itc);
  const net = Math.max(0, tax - itc);

  const itcRow = { ty: "OTH", iamt: 0, camt: rupees(itcC), samt: rupees(itcS), csamt: 0 };
  const payload = {
    gstin: gstin(),
    ret_period: g1.fp,
    sup_details: {
      osup_det: { txval: rupees(outwardTaxable), iamt: 0, camt: rupees(cgst), samt: rupees(sgst), csamt: 0 },
      osup_zero: { txval: 0, iamt: 0, csamt: 0 },
      osup_nil_exmp: { txval: 0 },
      isup_rev: { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 },
      osup_nongst: { txval: 0 },
    },
    itc_elg: {
      itc_avl: [itcRow],
      itc_net: { iamt: 0, camt: rupees(itcC), samt: rupees(itcS), csamt: 0 },
    },
  };
  const summary = {
    period: g1.period,
    outward_taxable_minor: outwardTaxable,
    cgst_minor: cgst,
    sgst_minor: sgst,
    igst_minor: 0,
    itc_minor: itc,
    net_payable_minor: net,
    net_tax_minor: net,
  };

  const prev = await existing(g1.period, "GSTR3B");
  if (prev?.status === "filed") {
    return { form: "GSTR3B", period: g1.period, ...(prev.summary as Row), status: "filed", note: "Already filed for this period; the filed draft was not overwritten." };
  }
  await upsertDraft(g1.period, "GSTR3B", summary, payload);
  return {
    ...summary,
    form: "GSTR3B",
    period: g1.period,
    status: "draft",
    note: "Draft from recorded sales, credit notes and the input tax credit you supplied. Filing needs owner approval.",
  };
}

export async function fileGstReturn(input: { form: Form; period: string }) {
  const { form, period } = input;
  const row = await existing(period, form);
  if (!row) throw new Error(`No ${form} draft for ${period} — prepare it first.`);
  if (row.status === "filed") return { form, period, status: "filed", reference: null, note: "Already filed for this period." };

  const db = admin();
  const fail = async (portal_message: string, portal_response: unknown = null) => {
    await db
      .from("gst_returns")
      .update({ status: "portal_error", portal_response: portal_response ?? { error: portal_message } })
      .eq("company_id", COMPANY_ID)
      .eq("period", period)
      .eq("form", form);
    return { form, period, status: "portal_error", portal_message };
  };

  if (!whitebooksEnabled() || !gstUser(1)) return fail("GST portal sandbox is not configured (no WhiteBooks keys or test taxpayer).");
  let res: Row;
  try {
    res = await saveReturn(form, row.payload as Row);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  if (res.status_cd !== "1") {
    const err = (res.error ?? {}) as Row;
    return fail(String(err.message ?? err.errorMessage ?? res.status_desc ?? "GST portal rejected the return"), res);
  }

  await db
    .from("gst_returns")
    .update({ status: "filed", filed_at: new Date().toISOString(), portal_response: res })
    .eq("company_id", COMPANY_ID)
    .eq("period", period)
    .eq("form", form);
  const data = (res.data ?? {}) as Row;
  return {
    form,
    period,
    status: "filed",
    reference: (data.reference_id as string | undefined) ?? null,
    note: "Saved to the GST portal sandbox. Sign and submit with EVC/DSC on the portal.",
  };
}
