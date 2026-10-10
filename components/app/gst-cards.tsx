"use client";

// Cards for GST return drafts (GSTR-1 / GSTR-3B) and portal filing results.
import { FileCheck2, FileText, TriangleAlert } from "lucide-react";
import { money } from "@/lib/format";
import { Row, Shell, str } from "@/components/app/tool-cards";

type R = Record<string, unknown>;
const inr = (v: unknown) => money(Number(v ?? 0), "INR");

export function Gstr1DraftCard({ r }: { r: R }) {
  const filed = r.status === "filed";
  return (
    <Shell
      icon={<FileText className="size-4 text-sky-600" />}
      title={filed ? "GSTR-1 (already filed)" : "GSTR-1 draft"}
      tone={filed ? "ok" : "default"}
      footer={<span>{str(r.note)}</span>}>
      <Row k="Period" v={str(r.period)} />
      <Row k="Invoices" v={str(r.invoices)} />
      <Row k="Taxable value" v={inr(r.taxable_minor)} />
      <Row k="CGST @ 9%" v={inr(r.cgst_minor)} />
      <Row k="SGST @ 9%" v={inr(r.sgst_minor)} />
      <Row k="Credit notes" v={`− ${inr(r.credit_notes_minor)}`} />
      <Row k="Net tax" v={inr(r.net_tax_minor)} strong />
    </Shell>
  );
}

export function Gstr3bDraftCard({ r }: { r: R }) {
  const filed = r.status === "filed";
  return (
    <Shell
      icon={<FileText className="size-4 text-indigo-600" />}
      title={filed ? `GSTR-3B ${str(r.period)} (already filed)` : `GSTR-3B draft · ${str(r.period)}`}
      tone={filed ? "ok" : "default"}
      footer={<span>{str(r.note)}</span>}>
      <Row k="Outward taxable" v={inr(r.outward_taxable_minor)} />
      <Row k="CGST" v={inr(r.cgst_minor)} />
      <Row k="SGST" v={inr(r.sgst_minor)} />
      <Row k="Input tax credit" v={`− ${inr(r.itc_minor)}`} />
      <Row k="Net payable" v={inr(r.net_payable_minor)} strong />
    </Shell>
  );
}

export function GstFiledCard({ r }: { r: R }) {
  const form = str(r.form) === "GSTR3B" ? "GSTR-3B" : "GSTR-1";
  if (r.status === "filed") {
    return (
      <Shell icon={<FileCheck2 className="size-4 text-emerald-600" />} title={`${form} saved to GST portal`} tone="ok" footer={<span>{str(r.note)}</span>}>
        <Row k="Period" v={str(r.period)} />
        <Row k="Status" v="Filed (sandbox)" strong />
        <Row k="Reference" v={str(r.reference) || "—"} />
      </Shell>
    );
  }
  return (
    <Shell icon={<TriangleAlert className="size-4 text-amber-600" />} title={`${form} not filed`} tone="warn" footer={<span>The draft is kept. Fix the portal issue and ask again.</span>}>
      <Row k="Period" v={str(r.period)} />
      <Row k="Status" v="Portal error" strong />
      <p className="text-muted-foreground mt-2 text-xs">{str(r.portal_message)}</p>
    </Shell>
  );
}
