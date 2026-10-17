import { describe, expect, it } from "vitest";
import { parseEnv, resolveMode } from "@/lib/env";

describe("env", () => {
  it("applies safe defaults on an empty environment", () => {
    const env = parseEnv({});
    expect(env.SEND_ENABLED).toBe(false);
    expect(env.WHATSAPP_ENABLED).toBe(false);
    expect(env.ANTHROPIC_MODE).toBe("mock");
    expect(env.DAPTA_MODE).toBe("widget_only");
    expect(env.SOCRATA_RUES_DATASET).toBe("c82u-588k");
    expect(env.HUMAN_MINUTE_RATE_USD).toBe(0.42);
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("treats empty strings as unset and parses booleans/numbers", () => {
    const env = parseEnv({ DATABASE_URL: "", SEND_ENABLED: "true", DAPTA_CREDIT_USD: "0.002", ANTHROPIC_MODE: "" });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.SEND_ENABLED).toBe(true);
    expect(env.DAPTA_CREDIT_USD).toBe(0.002);
    expect(env.ANTHROPIC_MODE).toBe("mock");
  });

  it("rejects invalid modes", () => {
    expect(() => parseEnv({ APIFY_MODE: "bogus" })).toThrow();
  });
});

describe("resolveMode", () => {
  it("public APIs are real without credentials", () => {
    const env = parseEnv({});
    expect(resolveMode("overpass", env)).toBe("real");
    expect(resolveMode("socrata", env)).toBe("real");
  });

  it("falls back to mock when requested real but credential is missing", () => {
    const env = parseEnv({ ANTHROPIC_MODE: "real", GOOGLE_PLACES_MODE: "real", APIFY_MODE: "real", EMAIL_MODE: "real" });
    for (const s of ["anthropic", "google_places", "apify", "email"] as const) expect(resolveMode(s, env)).toBe("mock");
  });

  it("is real only with mode real and credential present", () => {
    const env = parseEnv({ ANTHROPIC_MODE: "real", ANTHROPIC_API_KEY: "k", EMAIL_MODE: "real", RESEND_API_KEY: "r" });
    expect(resolveMode("anthropic", env)).toBe("real");
    expect(resolveMode("email", env)).toBe("mock"); // EMAIL_FROM missing
    expect(resolveMode("google_places", parseEnv({ GOOGLE_PLACES_API_KEY: "k" }))).toBe("mock"); // mode stays mock
  });

  it("respects forced mock for public APIs", () => {
    expect(resolveMode("overpass", parseEnv({ OVERPASS_MODE: "mock" }))).toBe("mock");
  });
});
