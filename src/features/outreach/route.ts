import { NextResponse } from "next/server";
import { getDb, getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import type { HandlerResult } from "@/features/icp/api";
import { getAnthropic } from "@/integrations/anthropic";
import { getEmail } from "@/integrations/email";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import type { OutreachDeps } from "./service";

type Handler = (db: AppDb, json: unknown, deps: OutreachDeps) => Promise<HandlerResult>;

/** Shared wiring for the /api/outreach/* routes: access gate, JSON parsing, real dependencies. */
export async function runOutreachRoute(req: Request, handler: Handler): Promise<Response> {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const env = getEnv();
  await getReadyDb();
  const res = await handler(getDb().db, json, { ai: getAnthropic(env), email: getEmail(env), env });
  return NextResponse.json(res.body, { status: res.status });
}
