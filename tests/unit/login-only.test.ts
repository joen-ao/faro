import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { requireAppAccess } from "@/lib/app-access";

const env = { APP_ACCESS_KEY: "team-key", NODE_ENV: "production" };
const req = (cookie?: string, method = "GET", path = "/api/hunts") =>
  new Request(`https://faro.test${path}`, { method, headers: cookie ? { cookie } : {} });

describe("F23 · Faro only with the team key", () => {
  it("lets the team key in and nothing else", () => {
    expect(requireAppAccess(req("faro_key=team-key"), env)).toBeNull();
    expect(requireAppAccess(req(), env)?.status).toBe(401);
    expect(requireAppAccess(req("faro_key=nope"), env)?.status).toBe(401);
  });
  it("no longer accepts the old evaluator token, not even for reads", () => {
    const old = createHash("sha256").update("faro-evaluator:team-key").digest("hex");
    expect(requireAppAccess(req(`faro_key=${old}`), env)?.status).toBe(401);
    expect(requireAppAccess(req(`faro_key=${old}`, "POST", "/api/icp/parse"), env)?.status).toBe(401);
  });
  it("denies everything in production when no key is configured", () => {
    expect(requireAppAccess(req("faro_key=x"), { NODE_ENV: "production" })?.status).toBe(401);
  });
});
