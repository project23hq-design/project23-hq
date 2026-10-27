import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@project23/database";
import { env } from "../env";

/**
 * Service-role client: BYPASSES RLS. Only for webhooks, jobs, guest checkout and other
 * flows that perform their own explicit authorization first. Never use it to read data
 * on behalf of a signed-in user just to avoid writing a policy.
 */
let client: ReturnType<typeof createClient<Database>> | null = null;
export function adminClient() {
  if (!client) {
    const e = env();
    client = createClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
