// Staff notifications (the bell): who should know, deduplicated by key. Never blocks the business action.
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { type AppKey, notifications, type Role, users } from "@/db/schema";

type To = { userIds?: (number | null | undefined)[]; app?: AppKey; roles?: Role[] };

export async function notify(to: To, n: { kind: string; title: string; href?: string; key?: string }) {
  try {
    const ids = new Set<number>((to.userIds ?? []).filter((v): v is number => typeof v === "number"));
    if (to.app || to.roles) {
      const staff = await db.select({ id: users.id, role: users.role, apps: users.apps }).from(users).where(eq(users.active, true));
      for (const u of staff) {
        const roleOk = !to.roles || to.roles.includes(u.role);
        const appOk = !to.app || u.role === "admin" || u.apps.includes(to.app);
        if (roleOk && appOk) ids.add(u.id);
      }
    }
    if (!ids.size) return;
    await db.insert(notifications).values([...ids].map((userId) => ({ userId, kind: n.kind, title: n.title.slice(0, 200), href: n.href ?? null,
      key: n.key ? `${n.key}:${userId}` : null }))).onConflictDoNothing();
  } catch (error) {
    console.error("notify failed:", (error as Error).message);
  }
}

export async function unreadCount(userId: number) {
  const rows = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}

export async function markRead(userId: number, ids?: number[]) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt),
    ...(ids ? [inArray(notifications.id, ids)] : [])));
}
