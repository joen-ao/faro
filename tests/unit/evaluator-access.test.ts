import { describe, expect, it } from "vitest";
import { evaluatorToken, isEvaluator, requireAppAccess } from "@/lib/app-access";

const env = { APP_ACCESS_KEY: "team-key", NODE_ENV: "production" };
const req = (method: string, path: string, cookie: string) => new Request(`https://faro.test${path}`, { method, headers: { cookie } });
const evalCookie = `faro_key=${evaluatorToken("team-key")}`;

describe("evaluator access", () => {
  it("reads everything and may try a search, never sends, spends on Apify or changes settings", () => {
    expect(requireAppAccess(req("GET", "/app/dashboard", evalCookie), env)).toBeNull();
    expect(requireAppAccess(req("GET", "/api/hunts/x/stream", evalCookie), env)).toBeNull();
    expect(requireAppAccess(req("POST", "/api/hunts", evalCookie), env)).toBeNull();
    expect(requireAppAccess(req("POST", "/api/hunts/abc/run", evalCookie), env)).toBeNull();
    expect(requireAppAccess(req("POST", "/api/outreach/preview", evalCookie), env)).toBeNull();
    for (const [m, p] of [["POST", "/api/outreach/send"], ["POST", "/api/hunts/abc/enrich"], ["PUT", "/api/settings/send-window"], ["PUT", "/api/settings/services"], ["POST", "/api/dapta/push"]]) {
      expect(requireAppAccess(req(m!, p!, evalCookie), env)?.status, p).toBe(403);
    }
  });

  it("keeps the team key all-powerful and rejects anything else", () => {
    expect(requireAppAccess(req("POST", "/api/outreach/send", "faro_key=team-key"), env)).toBeNull();
    expect(requireAppAccess(req("GET", "/app/dashboard", "faro_key=nope"), env)?.status).toBe(401);
    expect(isEvaluator(evalCookie, env)).toBe(true);
    expect(isEvaluator("faro_key=team-key", env)).toBe(false);
    expect(evaluatorToken("team-key")).not.toContain("team-key");
  });
});
