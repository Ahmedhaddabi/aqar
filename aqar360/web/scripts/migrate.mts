// Applies pending migrations (drizzle/). Locally: npm run db:migrate. On Vercel it runs before every build.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL not set: skipping migrations");
  process.exit(0);
}
const client = postgres(url, { max: 1, prepare: false });
await migrate(drizzle({ client }), { migrationsFolder: "drizzle" });
await client.end();
console.log("database is up to date");
