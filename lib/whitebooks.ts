// WhiteBooks GST API client (sandbox). Endpoints/headers follow the provided OpenAPI collection:
// public APIs need client_id/client_secret; return APIs additionally need gst_username, state_cd,
// ip_address and a txn obtained via the OTP flow (sandbox OTP is documented as 575757).
export function whitebooksEnabled() {
  return Boolean(
    process.env.WHITEBOOKS_BASE_URL_SANDBOX &&
      process.env.WHITEBOOKS_CLIENT_ID_SANDBOX &&
      process.env.WHITEBOOKS_CLIENT_SECRET_SANDBOX,
  );
}

type Auth = { gstUsername: string; stateCd: string; txn: string };

async function wb(
  path: string,
  query: Record<string, string>,
  auth?: Partial<Auth> & { ip?: string },
  opts?: { method?: "GET" | "PUT" | "POST"; body?: unknown },
) {
  if (!whitebooksEnabled()) throw new Error("WhiteBooks sandbox not configured");
  const url = new URL(path, process.env.WHITEBOOKS_BASE_URL_SANDBOX);
  url.searchParams.set("email", process.env.WHITEBOOKS_REGISTERED_EMAIL ?? "");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const headers: Record<string, string> = {
    client_id: process.env.WHITEBOOKS_CLIENT_ID_SANDBOX!,
    client_secret: process.env.WHITEBOOKS_CLIENT_SECRET_SANDBOX!,
  };
  if (auth?.gstUsername) headers.gst_username = auth.gstUsername;
  if (auth?.stateCd) headers.state_cd = auth.stateCd;
  if (auth?.txn) headers.txn = auth.txn;
  if (auth) headers.ip_address = auth.ip ?? process.env.WHITEBOOKS_IP ?? "";

  const init: RequestInit = { headers, signal: AbortSignal.timeout(20_000) };
  if (opts?.method && opts.method !== "GET") {
    init.method = opts.method;
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(opts.body ?? {});
  }
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WhiteBooks ${res.status}`);
  return body as Record<string, unknown>;
}

// Public: look up a taxpayer by GSTIN (no GST login needed).
export function searchTaxpayer(gstin: string) {
  return wb("/public/search", { gstin });
}

// ---- Authenticated (GST login) calls ----------------------------------------------------------
// Sandbox flow: request an OTP for a test GST user, authenticate with the documented sandbox OTP,
// then pass the returned txn on every return/ledger call.
export type GstUser = { gstin: string; gstUsername: string; stateCd: string };

export function gstUser(n = 1): GstUser | null {
  const gstin = process.env[`WHITEBOOKS_GSTIN_${n}`];
  const gstUsername = process.env[`WHITEBOOKS_GST_USERNAME_${n}`];
  const stateCd = process.env[`WHITEBOOKS_STATE_CD_${n}`];
  return gstin && gstUsername && stateCd ? { gstin, gstUsername, stateCd } : null;
}

async function login(u: GstUser): Promise<Auth> {
  const otp = await wb("/authentication/otprequest", {}, { gstUsername: u.gstUsername, stateCd: u.stateCd });
  const txn = String(otp.txn ?? "");
  if (!txn) throw new Error("WhiteBooks did not return a transaction id");
  const auth = { gstUsername: u.gstUsername, stateCd: u.stateCd, txn };
  // 575757 is the documented sandbox-only OTP
  const res = await wb("/authentication/authtoken", { otp: "575757" }, auth);
  if (res.status_cd !== "1") throw new Error("WhiteBooks sandbox login failed");
  return auth;
}

// Cash + input-tax-credit ledger balances for the connected test taxpayer.
export async function ledgerBalance(retperiod: string, n = 1) {
  const u = gstUser(n);
  if (!u) throw new Error("No WhiteBooks test taxpayer configured");
  const auth = await login(u);
  const r = await wb("/ledgers/bal", { gstin: u.gstin, retperiod }, auth);
  if (r.status_cd !== "1") {
    const e = (r.error ?? {}) as Record<string, unknown>;
    throw new Error(String(e.errorMessage ?? "ledger balance unavailable"));
  }
  return r.data as Record<string, unknown>;
}

// Save (not submit) a GSTR-1 / GSTR-3B draft to the sandbox portal. Signing (EVC/DSC) happens on the portal.
export async function saveReturn(form: "GSTR1" | "GSTR3B", payload: Record<string, unknown>, n = 1) {
  const u = gstUser(n);
  if (!u) throw new Error("No WhiteBooks test taxpayer configured");
  const auth = await login(u);
  const retPeriod = String(payload.fp ?? payload.ret_period ?? "");
  const path = form === "GSTR1" ? "/gstr1/retsave" : "/gstr3b/retsave";
  return wb(path, { gstin: u.gstin, retperiod: retPeriod }, auth, { method: "PUT", body: { ...payload, gstin: u.gstin } });
}
