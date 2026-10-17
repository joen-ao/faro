import { NextResponse } from "next/server";
import { getEnv, resolveMode, SERVICES, type Service, type ServiceMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  const env = getEnv();
  const modes = Object.fromEntries(SERVICES.map((s) => [s, resolveMode(s, env)])) as Record<Service, ServiceMode>;
  return NextResponse.json({ status: "ok", sendEnabled: env.SEND_ENABLED, dapta: env.DAPTA_MODE, modes });
}
