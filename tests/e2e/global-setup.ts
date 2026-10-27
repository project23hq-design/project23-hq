import pg from "pg";

/** Local test runs only: reset rate-limit windows so repeated runs don't trip abuse protection. */
export default async function globalSetup() {
  const client = new pg.Client({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
  });
  await client.connect();
  await client.query("delete from private.rate_limits");
  await client.end();
}
