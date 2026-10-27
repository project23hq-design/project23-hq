import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { OrgRole } from "@project23/domain";

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser(); // verified with the Auth server, not just the cookie
  const user = data.user ?? null;
  let aal: "aal1" | "aal2" | null = null;
  if (user) {
    const { data: a } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    aal = (a?.currentLevel as "aal1" | "aal2" | null) ?? "aal1";
  }
  return { supabase, user, aal };
});

export async function requireUser(next = "/account") {
  const s = await getSession();
  if (!s.user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return { ...s, user: s.user };
}

export interface OrgContext {
  id: string;
  slug: string;
  name: string;
  role: OrgRole;
  is_first_party: boolean;
  approval_status: string;
  verification_status: string;
  payout_status: string;
  status: string;
}

export const getMyOrganizations = cache(async (): Promise<OrgContext[]> => {
  const { supabase, user } = await getSession();
  if (!user) return [];
  const { data } = await supabase
    .from("memberships")
    .select(
      "role, organizations(id, slug, name, is_first_party, approval_status, verification_status, payout_status, status)",
    )
    .eq("user_id", user.id);
  return (data ?? [])
    .filter((m) => m.organizations)
    .map((m) => ({
      ...(m.organizations as unknown as Omit<OrgContext, "role">),
      role: m.role as OrgRole,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

/** Resolve an organization by slug for the current member, enforcing roles server-side. */
export async function requireOrg(slug: string, roles?: OrgRole[]) {
  const s = await requireUser(`/organizer/${slug}`);
  const orgs = await getMyOrganizations();
  const org = orgs.find((o) => o.slug === slug);
  if (!org) redirect("/organizer");
  if (roles && !roles.includes(org.role)) redirect(`/organizer/${slug}?denied=1`);
  return { ...s, org };
}

/** Platform staff: an active assignment AND an MFA-verified (aal2) session. */
export async function requirePlatformAdmin() {
  const s = await requireUser("/super-admin");
  const { data: roles } = await s.supabase.rpc("my_platform_roles");
  if (!roles || roles.length === 0) redirect("/?denied=admin");
  if (s.aal !== "aal2") redirect("/account/security?mfa=required&next=/super-admin");
  return { ...s, roles: roles as string[] };
}

/** Validate a post-auth redirect target: internal paths only. */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  return next;
}
