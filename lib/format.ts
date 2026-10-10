const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

// amounts are stored in minor units (paise / cents)
export function money(minor: unknown, currency: unknown = "INR") {
  const cur = String(currency ?? "INR");
  const value = Number(minor ?? 0) / 100;
  const locale = cur === "INR" ? "en-IN" : "en-US";
  return `${SYMBOL[cur] ?? cur + " "}${value.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
}

export function dateTime(v: unknown) {
  if (!v) return "";
  return new Date(String(v)).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function shortId(v: unknown) {
  return String(v ?? "").slice(-6);
}
