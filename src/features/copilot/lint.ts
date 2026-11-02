import { BLOCKED_PATTERNS } from "./knowledge";

export interface LintIssue {
  field: "primaryText" | "headline" | "description" | "hook";
  rule: string;
  message: string;
}

export interface LintableAd {
  primaryText: string;
  headline: string;
  description?: string;
  hook?: string;
}

const LIMITS = { primaryText: 500, headline: 80, description: 120, hook: 120 } as const;

/** Numbers that appear in catalog prices ("Desde USD 3.000" -> "3000"). */
export function allowedPriceNumbers(prices: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const p of prices) for (const m of (p ?? "").matchAll(/\d[\d.,]*/g)) out.add(m[0].replace(/[.,]/g, ""));
  return out;
}

/** Deterministic policy linter (code, not AI): blocked claims, prices outside the catalog, Meta length limits. */
export function lintAd(ad: LintableAd, allowedPrices: Set<string>): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const field of ["primaryText", "headline", "description", "hook"] as const) {
    const text = ad[field];
    if (!text) continue;
    if (text.length > LIMITS[field]) issues.push({ field, rule: "longitud", message: `Supera ${LIMITS[field]} caracteres.` });
    for (const p of BLOCKED_PATTERNS) if (p.re.test(text)) issues.push({ field, rule: p.id, message: p.message });
    for (const m of text.matchAll(/(?:USD|US\$|\$|COP)\s?(\d[\d.,]*)/gi)) {
      const n = m[1]!.replace(/[.,]/g, "");
      if (!allowedPrices.has(n)) issues.push({ field, rule: "precio_fuera_catalogo", message: `El precio "${m[0]}" no está en el catálogo de servicios.` });
    }
  }
  return issues;
}
