// Masks sensitive data in outgoing text before it leaves the system (e.g. in emails).
// Order matters: most specific patterns first.
const RULES: { name: string; re: RegExp; replace: (m: string) => string }[] = [
  // card numbers: 13-19 digits, optionally separated by single spaces or dashes (no trailing separator)
  { name: "card", re: /\b\d(?:[ -]?\d){12,18}\b/g, replace: (m) => `[card ending ${m.replace(/\D/g, "").slice(-4)}]` },
  // GSTIN
  { name: "gstin", re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g, replace: (m) => `${m.slice(0, 2)}**********${m.slice(-3)}` },
  // PAN
  { name: "pan", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g, replace: () => "[PAN redacted]" },
  // IFSC
  { name: "ifsc", re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, replace: () => "[IFSC redacted]" },
  // phone numbers (Indian mobiles, optional +91) - must run before the generic digit-run rule
  { name: "phone", re: /(?:\+91[ -]?)?\b[6-9]\d{9}\b/g, replace: () => "[phone redacted]" },
  // bank account style references (9-18 digits) and masked references like XXXX1234
  { name: "account", re: /\b\d{9,18}\b/g, replace: (m) => `[account ending ${m.slice(-4)}]` },
  { name: "account-ref", re: /\bX{2,}\d{3,6}\b/g, replace: () => "[account redacted]" },
  // secret-looking keys and tokens
  { name: "secret", re: /\b(?:sk|pk|rk|sbp|whsec|re|gsk)_[A-Za-z0-9_+-]{8,}\b/g, replace: () => "[secret redacted]" },
];

export function redact(text: string) {
  let out = text;
  const found: string[] = [];
  for (const r of RULES) {
    out = out.replace(r.re, (m) => {
      if (!found.includes(r.name)) found.push(r.name);
      return r.replace(m);
    });
  }
  return { text: out, redacted: found };
}
