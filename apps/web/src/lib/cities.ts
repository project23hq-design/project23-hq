import "server-only";
import { engineCode, engineErrorMessage } from "@project23/domain";
import type { createClient } from "./supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Existing cities (for suggestions) and Nigeria's states (needed when a city is new). */
export async function cityOptions(supabase: Client) {
  const [cities, states] = await Promise.all([
    supabase.from("cities").select("id, name, regions(code)").order("name"),
    supabase.from("regions").select("code, name").eq("country_code", "NG").order("name"),
  ]);
  return {
    cities: (cities.data ?? []).map((c) => ({ id: c.id, name: c.name, state: c.regions?.code })),
    states: states.data ?? [],
  };
}

/** Typed city (+ state) → cities.id. A city nobody has used yet is created under that state. */
export async function resolveCity(
  supabase: Client,
  city: string | undefined,
  state: string | undefined,
): Promise<{ cityId?: string; error?: string }> {
  if (!city?.trim()) return {};
  const { data, error } = await supabase.rpc("resolve_city", {
    p_name: city,
    p_state: state ?? undefined,
  });
  if (error) return { error: engineErrorMessage(engineCode(error), error.message) };
  return { cityId: data ?? undefined };
}
