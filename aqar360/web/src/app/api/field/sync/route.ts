import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { canOpen, currentUser } from "@/lib/auth";
import { applyFieldOp, FieldOp } from "@/lib/field-sync";
import { readJson, reject, sameOrigin } from "@/lib/request";

/** The field app sends what was recorded on the phone (in order); each action reports done or denied. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject(403, "not_permitted", "Cross-site requests are not allowed.");
  const user = await currentUser();
  if (!user || !canOpen(user, "crm")) return reject(401, "not_signed_in", "Please sign in again.");
  const parsed = z.object({ ops: z.array(FieldOp).min(1).max(50) }).safeParse(await readJson(request, 64_000));
  if (!parsed.success) return reject(400, "invalid_request", "Invalid request body.");
  const results: Record<string, "done" | "denied"> = {};
  for (const op of parsed.data.ops) results[op.id] = await applyFieldOp(user, op);
  return NextResponse.json({ ok: true, data: { results } }, { headers: { "Cache-Control": "no-store" } });
}
