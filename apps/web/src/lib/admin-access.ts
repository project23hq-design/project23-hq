/**
 * Platform-staff permission matrix for /super-admin. `super_admin` can do everything.
 *
 * This decides what each role sees and which server actions it may call. Newer database
 * functions (users, staff, analytics) enforce the same roles themselves; older admin RPCs
 * still accept any platform role, so the app is the gate for those.
 */
export type PlatformRole = "super_admin" | "finance_admin" | "support";

const ALL: PlatformRole[] = ["super_admin", "finance_admin", "support"];

export const ADMIN_ACCESS = {
  // pages
  overview: ALL,
  analytics: ALL,
  users: ALL,
  staff: ["super_admin"],
  events: ALL,
  organizations: ALL,
  orders: ALL,
  finance: ["super_admin", "finance_admin"],
  fees: ["super_admin", "finance_admin"],
  categories: ["super_admin"],
  reports: ["super_admin", "support"],
  jobs: ["super_admin", "support"],
  audit: ["super_admin", "finance_admin"],
  settings: ["super_admin"],
  // actions
  "users.support": ["super_admin", "support"],
  "events.manage": ["super_admin", "support"],
  "events.cancel": ["super_admin"],
  "organizations.manage": ["super_admin"],
} satisfies Record<string, PlatformRole[]>;

export type AdminCapability = keyof typeof ADMIN_ACCESS;

export function canAccess(roles: readonly string[], cap: AdminCapability): boolean {
  if (roles.includes("super_admin")) return true;
  return (ADMIN_ACCESS[cap] as readonly string[]).some((r) => roles.includes(r));
}

export const ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "Super admin",
  finance_admin: "Finance admin",
  support: "Support",
};

export const ROLE_DESCRIPTIONS: Record<PlatformRole, string> = {
  super_admin: "Everything, including staff, settings, categories and blocking organizations.",
  finance_admin:
    "Finance, payouts, refunds, fees and the audit log, plus read-only access elsewhere.",
  support: "User support actions, pausing and featuring events, reports and jobs.",
};

/** "1 order", "3 orders". */
export function plural(n: number, word: string): string {
  return `${n.toLocaleString("en-NG")} ${word}${n === 1 ? "" : "s"}`;
}
