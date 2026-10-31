// One database connection pool per server process. Neon Postgres: a "dev" branch locally, the main branch in production.
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;
const globalForDb = globalThis as unknown as { aqarDb?: Db };

function getDb(): Db {
  if (globalForDb.aqarDb) return globalForDb.aqarDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare: false keeps it compatible with Neon's pooled (PgBouncer) connection string.
  const client = postgres(url, { max: process.env.VERCEL ? 1 : 3, prepare: false, idle_timeout: 20 });
  globalForDb.aqarDb = drizzle({ client, schema });
  return globalForDb.aqarDb;
}

/** Connected on first use, so builds and pages without data never need a database. */
export const db = new Proxy({} as Db, { get: (_target, prop) => Reflect.get(getDb(), prop) });
export { schema };
