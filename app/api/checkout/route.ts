import { createCheckout, dodoEnabled } from "@/lib/dodo";

// Creates a Dodo test-mode checkout session and returns its hosted URL.
export async function POST(req: Request) {
  if (!dodoEnabled()) return Response.json({ error: "Dodo test mode not configured" }, { status: 503 });
  const productId = process.env.DODO_PRODUCT_ID;
  if (!productId) return Response.json({ error: "DODO_PRODUCT_ID not set" }, { status: 503 });

  const { email, name } = (await req.json()) as { email?: string; name?: string };
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "valid email required" }, { status: 400 });

  try {
    const url = await createCheckout({
      productId,
      email,
      name,
      returnUrl: new URL("/", req.url).toString(),
    });
    return Response.json({ url });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "checkout failed" }, { status: 502 });
  }
}
