/**
 * Organization permission matrix (UI hints only — every rule is enforced again in
 * RLS policies and SECURITY DEFINER functions).
 */
export type OrgRole = "owner" | "manager" | "finance" | "scanner";

export type OrgPermission =
  | "org.edit"
  | "team.manage"
  | "team.invite"
  | "events.manage"
  | "orders.view"
  | "attendees.view"
  | "refunds.manage"
  | "finance.view"
  | "payouts.request"
  | "payouts.bank"
  | "gate.scan"
  | "referrals.manage";

export const PERMISSION_MATRIX: Record<OrgPermission, OrgRole[]> = {
  "org.edit": ["owner", "manager"],
  "team.manage": ["owner"],
  "team.invite": ["owner", "manager"],
  "events.manage": ["owner", "manager"],
  "orders.view": ["owner", "manager", "finance"],
  "attendees.view": ["owner", "manager"],
  "refunds.manage": ["owner", "manager", "finance"],
  "finance.view": ["owner", "finance"],
  "payouts.request": ["owner", "finance"],
  "payouts.bank": ["owner"],
  "gate.scan": ["owner", "manager", "scanner"], // scanners: only events they are assigned to
  "referrals.manage": ["owner", "manager"],
};

export function can(role: OrgRole | null | undefined, permission: OrgPermission): boolean {
  return !!role && PERMISSION_MATRIX[permission].includes(role);
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  manager: "Manager",
  finance: "Finance",
  scanner: "Event staff (scanner)",
};

export const EVENT_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_review", "archived"],
  pending_review: ["draft", "published"],
  published: ["paused", "cancelled", "completed"],
  paused: ["published", "cancelled", "completed"],
  cancelled: ["archived"],
  completed: ["archived"],
  archived: [],
};
