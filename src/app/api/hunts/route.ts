import { NextResponse } from "next/server";
import { z } from "zod";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { requireAppAccess } from "@/lib/app-access";
import { errorResponse } from "@/features/hunts/http";
import { createHunt } from "@/features/hunts/service";
import { IcpCriteria } from "@/features/icp/schema";

export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().trim().min(3).max(2000),
  criteria: IcpCriteria,
  threshold: z.number().int().min(0).max(100).optional(),
});

/** Creates the ICP profile and the hunt (state `pending`); the client then drives `POST /api/hunts/[id]/run`. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const body = Body.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ error: "Solicitud invalida", issues: body.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  try {
    const r = await createHunt(((await getReadyDb()) as unknown as AppDb), body.data);
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
