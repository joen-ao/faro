import { NextResponse } from "next/server";
import { z } from "zod";
import { getHuntsDb } from "@/features/hunts/db";
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
    const r = await createHunt(await getHuntsDb(), body.data);
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
