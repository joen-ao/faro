import { describe, expect, it, vi } from "vitest";
import { buildAdLink, MAX_CSV_BYTES, parseSpendCsv } from "@/features/ads";
import { parseTracking } from "@/features/diagnostic/params";

const envState = vi.hoisted(() => ({ campaign: "faro-q4" as string | undefined }));
vi.mock("@/lib/env", async (orig) => {
  const real = await orig<typeof import("@/lib/env")>();
  return { ...real, getEnv: () => ({ ...real.getEnv(), NEXT_PUBLIC_APP_URL: "https://faro.example.com/", META_ADS_CAMPAIGN_ID: envState.campaign }) };
});

describe("buildAdLink", () => {
  it("builds the UTM link with the default campaign and no double slash", () => {
    const url = buildAdLink("clinicas-dentales-bogota");
    expect(url).toBe("https://faro.example.com/d/icp/clinicas-dentales-bogota?utm_source=meta&utm_medium=paid_social&utm_campaign=faro-q4");
  });

  it("round-trips through parseTracking", () => {
    const u = new URL(buildAdLink("dental-miami", "camp_7"));
    const t = parseTracking(Object.fromEntries(u.searchParams));
    expect(t.utm).toEqual({ utm_source: "meta", utm_medium: "paid_social", utm_campaign: "camp_7" });
  });

  it("rejects unknown ICPs, unsafe campaign ids and a missing default", () => {
    expect(() => buildAdLink("nope")).toThrow(/ICP desconocido/);
    expect(() => buildAdLink("__proto__")).toThrow();
    expect(() => buildAdLink("dental-miami", "a&utm_source=x")).toThrow();
    expect(() => buildAdLink("dental-miami", "x".repeat(81))).toThrow();
    envState.campaign = undefined;
    expect(() => buildAdLink("dental-miami")).toThrow();
    envState.campaign = "faro-q4";
  });
});

describe("parseSpendCsv", () => {
  const head = "platform,campaign,date,usd,impressions,clicks\n";

  it("parses valid rows, defaults platform and counts", () => {
    const r = parseSpendCsv("campaign,date,usd\r\nfaro-q4,2026-10-01,12.5\r\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([{ platform: "meta", campaign: "faro-q4", date: "2026-10-01", usd: 12.5, impressions: 0, clicks: 0 }]);
    const full = parseSpendCsv(`${head}meta,faro-q4,2026-10-02,3.25,1000,40`);
    expect(full.rows[0]).toMatchObject({ usd: 3.25, impressions: 1000, clicks: 40 });
  });

  it("returns per-line errors and still keeps the valid rows", () => {
    const r = parseSpendCsv(
      [
        head.trim(),
        "meta,ok,2026-10-01,5,10,1",
        "meta,bad-date,2026-13-40,5,10,1",
        "meta,bad-usd,2026-10-02,-5,10,1",
        "meta,bad-usd2,2026-10-02,abc,10,1",
        "meta,ok,2026-10-01,9,10,1",
        "meta,clicks,2026-10-03,1,10,1.5",
        "meta,too,2026-10-03,1,1,1,extra",
      ].join("\n"),
    );
    expect(r.rows.map((x) => x.campaign)).toEqual(["ok"]);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(r.errors[0].error).toMatch(/fecha/);
    expect(r.errors[4].error).toMatch(/entero/);
    expect(r.errors[3].error).toMatch(/duplicada/);
  });

  it("rejects formula injection in text columns", () => {
    const r = parseSpendCsv(
      [head.trim(), '=HYPERLINK("http://evil"),x,2026-10-01,1,1,1', "meta,=1+1,2026-10-01,1,1,1", "@SUM(A1),c,2026-10-01,1,1,1", "+cmd,c,2026-10-01,1,1,1", "meta,\"-2+3\",2026-10-01,1,1,1"].join("\n"),
    );
    expect(r.rows).toEqual([]);
    expect(r.errors).toHaveLength(5);
  });

  it("handles quoted fields and a BOM", () => {
    const r = parseSpendCsv('﻿platform,campaign,date,usd\n"meta","my camp",2026-10-01,"7"\n');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ campaign: "my camp", usd: 7 });
  });

  it("rejects bad headers, empty files and files over 1 MB", () => {
    expect(parseSpendCsv("").errors[0].error).toMatch(/vacío/);
    expect(parseSpendCsv("foo,bar\n1,2").errors[0].error).toMatch(/cabecera/);
    expect(parseSpendCsv("campaign,date\nx,2026-10-01").errors[0].error).toMatch(/faltan usd/);
    const big = `${head}${"meta,c,2026-10-01,1,1,1\n".repeat(Math.ceil(MAX_CSV_BYTES / 20))}`;
    expect(parseSpendCsv(big).errors[0].error).toMatch(/1 MB/);
  });
});
