// Screenshot helper for design checks on the TEST database: makes a temporary admin with a session, prints the cookie
// value, and removes it again with "--cleanup". Never run against the live database.
import "./test-guard.mts";

import { createHash, randomBytes } from "node:crypto";

import { inArray, like } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, sessions, users } from "@/db/schema";

if (process.argv.includes("--cleanup")) {
  const ids = (await db.select({ id: users.id }).from(users).where(like(users.email, "shots-%@test.invalid"))).map((u) => u.id);
  if (ids.length) {
    await db.delete(auditLog).where(inArray(auditLog.userId, ids));
    await db.delete(users).where(inArray(users.id, ids)); // sessions go with the user
  }
  console.log(`removed ${ids.length}`);
} else {
  const tag = Date.now().toString(36);
  const [admin] = await db.insert(users).values({ name: "Ahmed Test", email: `shots-${tag}@test.invalid`, passwordHash: "x", role: "admin",
    apps: ["crm", "erp", "hr"], language: process.argv.includes("--en") ? "en" : "ar" }).returning();
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({ id: createHash("sha256").update(token).digest("hex"), userId: admin.id, expiresAt: new Date(Date.now() + 3_600_000) });
  console.log(token);
}
process.exit(0);
