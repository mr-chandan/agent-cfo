import DodoPayments from "dodopayments";

// Test-mode only: this app never talks to live Dodo, even if a live key is configured.
export function dodoEnabled() {
  return Boolean(process.env.DODO_PAYMENTS_API_KEY) && (process.env.DODO_PAYMENTS_ENV ?? "test_mode") === "test_mode";
}

let client: DodoPayments | null = null;
export function dodo() {
  if (!dodoEnabled()) throw new Error("Dodo Payments is not configured for test mode");
  client ??= new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY,
    environment: "test_mode",
  });
  return client;
}

export async function createCheckout(input: {
  productId: string;
  email: string;
  name?: string;
  returnUrl: string;
  amountMinor?: number; // pay-what-you-want products only: smallest unit of the product base currency (USD)
  metadata?: Record<string, string>; // echoed back on webhooks so a payment can be tied to our invoice
}) {
  const session = await dodo().checkoutSessions.create({
    product_cart: [
      { product_id: input.productId, quantity: 1, ...(input.amountMinor ? { amount: input.amountMinor } : {}) },
    ],
    customer: { email: input.email, name: input.name },
    return_url: input.returnUrl,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
  return session.checkout_url as string | null;
}

// Full refund when no amount; partial refund per item otherwise (amount in smallest currency unit).
export async function refundPayment(input: {
  paymentId: string;
  reason?: string;
  partial?: { productId: string; amountMinor: number };
}) {
  const refund = await dodo().refunds.create({
    payment_id: input.paymentId,
    reason: input.reason,
    items: input.partial
      ? [{ item_id: input.partial.productId, amount: input.partial.amountMinor, tax_inclusive: true }]
      : undefined,
  });
  return refund as { refund_id?: string; status?: string };
}

// Variable-amount request: the custom product is priced in USD (Dodo requires USD/EUR/GBP for
// pay-what-you-want), so the rupee amount is converted at USD_INR_RATE. Minimum charge is $1.00.
export function inrToUsdCents(inrMinor: number) {
  const rate = Number(process.env.USD_INR_RATE ?? 85);
  return Math.max(100, Math.round((inrMinor / 100 / rate) * 100));
}

export async function createCustomCheckout(input: {
  email: string;
  name?: string;
  amountInrMinor: number;
  returnUrl: string;
  metadata?: Record<string, string>;
}) {
  const productId = process.env.DODO_CUSTOM_PRODUCT_ID;
  if (!productId) throw new Error("DODO_CUSTOM_PRODUCT_ID not set");
  const usdCents = inrToUsdCents(input.amountInrMinor);
  const url = await createCheckout({
    productId,
    email: input.email,
    name: input.name,
    returnUrl: input.returnUrl,
    amountMinor: usdCents,
    metadata: input.metadata,
  });
  return { url, usdCents };
}
