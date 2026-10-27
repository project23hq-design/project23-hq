"use server";
import { revalidatePath } from "next/cache";
import { engineCode, engineErrorMessage } from "@project23/domain";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/action-form";

export async function applyToProgramAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requireUser("/promoter");
  if (f.get("accept") !== "on") return { error: "Please accept the program terms." };
  const { error } = await supabase.rpc("promoter_apply", { p_program: String(f.get("programId")), p_version: String(f.get("versionId")), p_note: String(f.get("note") ?? "").slice(0, 1000) || undefined });
  revalidatePath("/promoter");
  return error ? { error: engineErrorMessage(engineCode(error)) } : { message: "Applied. You'll get a link once the organizer approves you (or immediately for open programs)." };
}
