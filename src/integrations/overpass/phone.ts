const CALLING_CODES: Record<string, string> = { CO: "57", US: "1" };

const CO_NATIONAL = /^(3\d{9}|60\d{8})$/;

/**
 * Best-effort E.164 normalisation of one OSM phone value (takes the first of `a;b`).
 * Never invents digits: returns undefined when ambiguous or invalid.
 * Supported: Colombia (default) and NANP/US-style numbers; other countries only with an explicit `+`.
 */
export function normalizePhone(raw: string | undefined, country = "CO"): string | undefined {
  if (!raw) return undefined;
  const firstValue = raw.split(/[;,/]/)[0] ?? "";
  let s = firstValue.replace(/(ext|x|int)\.?\s*\d+\s*$/i, "").replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  const code = CALLING_CODES[country.toUpperCase()] ?? CALLING_CODES.CO;
  let digits: string;
  if (s.startsWith("+")) digits = s.slice(1);
  else if (code === "57") {
    if (CO_NATIONAL.test(s)) digits = "57" + s;
    else if (/^57(3\d{9}|60\d{8})$/.test(s)) digits = s;
    else if (/^1\d{7}$/.test(s)) digits = "5760" + s;
    else return undefined;
  } else if (/^1?[2-9]\d{9}$/.test(s)) digits = s.length === 10 ? "1" + s : s;
  else return undefined;

  if (digits.startsWith("57")) {
    const national = digits.slice(2);
    if (/^1\d{7}$/.test(national)) digits = "5760" + national;
    else if (/^57[1-8]\d{7}$/.test(national)) digits = "5760" + national.slice(2); // legacy "571 xxxxxxx"
    else if (!CO_NATIONAL.test(national)) return undefined;
  } else if (digits.startsWith("1") && !/^1[2-9]\d{9}$/.test(digits)) return undefined;
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return undefined;
  return "+" + digits;
}
