import { Webhook } from "standardwebhooks";
import { admin } from "@/lib/supabase-admin";

type Row = Record<string, unknown>;

const COMPANY_ID = process.env.DEFAULT_COMPANY_ID ?? "00000000-0000-0000-0000-00000000c001";

async function upsertCustomer(email: string | undefined, name: string | undefined) {
  if (!email) return null;
  const db = admin();
  const { data: existing } = await db
    .from("customers")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (existing) return (existing as Row).id as string;
  const { data } = await db
    .from("customers")
    .insert({ company_id: COMPANY_ID, email, name: name || email })
    .select("id")
    .single();
  return (data as Row | null)?.id as string | null;
}

// Verifies the Standard Webhooks signature, dedupes by webhook-id, then syncs our tables.
export async function POST(request: Request) {
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook secret not configured", { status: 503 });

  const rawBody = await request.text();
  const id = request.headers.get("webhook-id") ?? "";
  try {
    new Webhook(secret).verify(rawBody, {
      "webhook-id": id,
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    });
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(rawBody) as { type: string; data?: Row };
  const data = (event.data ?? {}) as Row;
  const db = admin();

  // idempotency: a retried delivery is acknowledged but not re-processed
  const { error: dupe } = await db.from("webhook_events").insert({ id, type: event.type, payload: event });
  if (dupe) return new Response(null, { status: 200 });

  try {
    if (event.type === "payment.succeeded") {
      const paymentId = String(data.payment_id);
      // Invoices we created carry metadata.order_id: mark that invoice paid instead of creating a new order.
      const meta = (data.metadata ?? {}) as Row;
      if (typeof meta.order_id === "string") {
        const { data: inv } = await db.from("orders").select("id,company_id,amount_minor,currency").eq("id", meta.order_id).maybeSingle();
        if (inv) {
          const o = inv as Row;
          await db.from("orders").update({ status: "paid", external_id: paymentId }).eq("id", o.id);
          await db.from("payments").upsert(
            { company_id: o.company_id, order_id: o.id, external_id: paymentId, amount_minor: o.amount_minor, currency: o.currency, kind: "charge", provider: "dodo" },
            { onConflict: "external_id" },
          );
          return new Response(null, { status: 200 });
        }
      }
      const cust = (data.customer ?? {}) as Row;
      const customerId = await upsertCustomer(cust.email as string, cust.name as string);
      if (customerId) {
        const cart = (data.product_cart as Row[] | undefined) ?? [];
        const { data: order } = await db
          .from("orders")
          .upsert(
            {
              company_id: COMPANY_ID,
              customer_id: customerId,
              external_id: paymentId,
              amount_minor: Number(data.total_amount),
              currency: String(data.currency ?? "USD"),
              status: "paid",
              product_id: (cart[0]?.product_id as string | undefined) ?? null,
            },
            { onConflict: "external_id" },
          )
          .select("id")
          .single();
        if (order) {
          await db.from("payments").upsert(
            {
              company_id: COMPANY_ID,
              order_id: (order as Row).id,
              external_id: paymentId,
              amount_minor: Number(data.total_amount),
              currency: String(data.currency ?? "USD"),
              kind: "charge",
              provider: "dodo",
            },
            { onConflict: "external_id" },
          );
        }
      }
    } else if (event.type === "refund.succeeded") {
      // refunds we issued are already recorded; ones made in the Dodo dashboard are mirrored here
      const refundId = String(data.refund_id);
      const { data: known } = await db.from("payments").select("id").eq("external_id", refundId).maybeSingle();
      if (!known) {
        const { data: order } = await db
          .from("orders")
          .select("id,company_id,currency")
          .eq("external_id", String(data.payment_id))
          .maybeSingle();
        if (order) {
          const o = order as Row;
          await db.from("payments").insert({
            company_id: o.company_id,
            order_id: o.id,
            external_id: refundId,
            amount_minor: Number(data.amount ?? 0),
            currency: o.currency,
            kind: "refund",
            provider: "dodo",
          });
          await db.from("orders").update({ status: "partially_refunded" }).eq("id", o.id);
        }
      }
    } else if (event.type === "dispute.opened") {
      const { data: order } = await db
        .from("orders")
        .select("id,customer_id")
        .eq("external_id", String(data.payment_id))
        .maybeSingle();
      if (order) {
        const o = order as Row;
        await db.from("disputes").upsert(
          {
            company_id: COMPANY_ID,
            customer_id: o.customer_id,
            order_id: o.id,
            channel: "webhook",
            reason: String(data.remarks ?? data.reason ?? "Chargeback opened by cardholder"),
            external_id: String(data.dispute_id),
          },
          { onConflict: "external_id" },
        );
      }
    }
  } catch (e) {
    // return 500 so Dodo retries; drop the dedupe row so the retry is processed
    await db.from("webhook_events").delete().eq("id", id);
    return new Response(e instanceof Error ? e.message : "handler failed", { status: 500 });
  }

  return new Response(null, { status: 200 });
}
