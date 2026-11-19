import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime, formatMoney } from "@project23/domain";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Stat,
  Table,
  Td,
  Th,
} from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { canAccess, ROLE_LABELS, type PlatformRole } from "@/lib/admin-access";
import { PageHeader } from "@/components/dashboard-shell";
import { ActionForm } from "@/components/action-form";
import { userAction } from "../../actions";

export const metadata = { title: "User" };

type Detail = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned: boolean;
  banned_until: string | null;
  mfa_enrolled: boolean;
  active_sessions: number;
  profile: {
    full_name: string | null;
    phone: string | null;
    marketing_opt_in: boolean;
    deleted_at: string | null;
  } | null;
  roles: { role: PlatformRole; granted_at: string; revoked_at: string | null }[];
  memberships: {
    organization_id: string;
    name: string;
    slug: string;
    role: string;
    status: string;
    joined_at: string;
  }[];
  enrollments: {
    id: string;
    status: string;
    event_id: string;
    event_title: string;
    created_at: string;
  }[];
  stats: { orders_paid: number; spent_minor: number; tickets: number };
  orders: {
    id: string;
    public_ref: string;
    status: string;
    total_minor: number;
    admissions: number;
    created_at: string;
    event_id: string;
    event_title: string;
  }[];
  audit: {
    id: number;
    action: string;
    reason: string | null;
    actor_id: string | null;
    created_at: string;
  }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, roles, user: me } = await requirePlatformAdmin("users");
  const { data, error } = await supabase.rpc("admin_user_detail", { p_user: id });
  if (error?.message === "not_found") notFound();
  if (error || !data)
    return <Alert tone="danger">This user couldn&apos;t be loaded: {error?.message}</Alert>;
  const u = data as unknown as Detail;
  const activeRoles = u.roles.filter((r) => !r.revoked_at);
  const isStaff = activeRoles.length > 0;
  const canSupport = canAccess(roles, "users.support");
  const canTouchStaff = roles.includes("super_admin");
  const isMe = me.id === u.id;

  const actions: [string, string][] = [];
  if (!u.email_confirmed_at) {
    actions.push(["resend_verification", "Email a verification link"]);
    actions.push(["confirm_email", "Mark email as verified"]);
  }
  actions.push(["password_reset", "Email a password reset link"]);
  if (!isMe && (!isStaff || canTouchStaff)) {
    actions.push(["sign_out", "Sign out of every device"]);
    actions.push(u.banned ? ["unban", "Lift ban"] : ["ban", "Ban (blocks sign-in, ends sessions)"]);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <Link href="/super-admin/users" className="hover:text-fg">
            ← Users
          </Link>
        }
        title={u.profile?.full_name || u.email}
        description={
          <>
            {u.email}
            {u.profile?.phone ? ` · ${u.profile.phone}` : ""} · joined{" "}
            {formatDateTime(u.created_at)}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-1">
            {u.banned && <Badge tone="danger">banned</Badge>}
            {u.email_confirmed_at ? (
              <Badge tone="success">email verified</Badge>
            ) : (
              <Badge tone="warning">email unverified</Badge>
            )}
            {u.mfa_enrolled && <Badge tone="info">MFA</Badge>}
            {activeRoles.map((r) => (
              <Badge key={r.role} tone="info">
                {ROLE_LABELS[r.role]}
              </Badge>
            ))}
            {u.profile?.deleted_at && <Badge tone="danger">profile deleted</Badge>}
          </div>
        }
        className="mb-0"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Paid orders" value={u.stats.orders_paid} />
        <Stat label="Total spent" value={formatMoney(u.stats.spent_minor)} />
        <Stat label="Valid tickets" value={u.stats.tickets} />
        <Stat
          label="Signed-in devices"
          value={u.active_sessions}
          hint={
            u.last_sign_in_at
              ? `Last sign-in ${formatDateTime(u.last_sign_in_at)}`
              : "Never signed in"
          }
        />
      </div>

      {canSupport && (
        <Card>
          <CardHeader>
            <CardTitle>Account support</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ActionForm
              action={userAction}
              submitLabel="Apply"
              submitVariant="secondary"
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
              confirm="Apply this action to the account? It will be recorded in the audit log."
            >
              <input type="hidden" name="userId" value={u.id} />
              <Select name="action" required defaultValue="" aria-label="Action">
                <option value="" disabled>
                  Choose an action…
                </option>
                {actions.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
              <Input
                name="reason"
                required
                minLength={3}
                placeholder="Reason (audited)"
                aria-label="Reason"
              />
            </ActionForm>
            <p className="text-xs text-fg-subtle">
              Links are emailed to {u.email}; you never see them. Signing out ends every session
              immediately. A ban also stops new sign-ins until lifted. Existing tickets and orders
              are never affected.
              {isStaff &&
                !canTouchStaff &&
                " Only a super admin can sign out or ban a staff account."}
            </p>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-medium">Orders</h2>
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Event</Th>
              <Th>Status</Th>
              <Th className="text-right">Tickets</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {u.orders.map((o) => (
              <tr key={o.id}>
                <Td>
                  <Link
                    className="font-mono text-xs hover:text-brand"
                    href={`/super-admin/orders?q=${o.public_ref}`}
                  >
                    {o.public_ref}
                  </Link>
                  <p className="text-xs text-fg-subtle">{formatDateTime(o.created_at)}</p>
                </Td>
                <Td>
                  <Link className="hover:text-brand" href={`/super-admin/events/${o.event_id}`}>
                    {o.event_title}
                  </Link>
                </Td>
                <Td>
                  <Badge>{o.status.replace(/_/g, " ")}</Badge>
                </Td>
                <Td className="text-right tabular-nums">{o.admissions}</Td>
                <Td className="text-right tabular-nums">{formatMoney(o.total_minor)}</Td>
              </tr>
            ))}
            {u.orders.length === 0 && (
              <tr>
                <Td colSpan={5} className="py-8 text-center text-fg-muted">
                  No orders. Guest orders appear here once they use this email.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            {u.memberships.length === 0 ? (
              <p className="text-sm text-fg-muted">Not a member of any organization.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {u.memberships.map((m) => (
                  <li key={m.organization_id} className="flex items-center justify-between gap-3">
                    <Link
                      className="hover:text-brand"
                      href={`/super-admin/organizations/${m.organization_id}`}
                    >
                      {m.name}
                    </Link>
                    <span className="flex gap-1">
                      <Badge>{m.role.replace(/_/g, " ")}</Badge>
                      {m.status === "suspended" && <Badge tone="danger">suspended</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Promoter programs</CardTitle>
          </CardHeader>
          <CardContent>
            {u.enrollments.length === 0 ? (
              <p className="text-sm text-fg-muted">Not enrolled as a promoter.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {u.enrollments.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3">
                    <Link className="hover:text-brand" href={`/super-admin/events/${e.event_id}`}>
                      {e.event_title}
                    </Link>
                    <Badge
                      tone={
                        e.status === "approved"
                          ? "success"
                          : e.status === "pending"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {e.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {u.roles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Platform roles</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {u.roles.map((r) => (
                <li key={r.role} className="flex justify-between gap-3">
                  <span>{ROLE_LABELS[r.role]}</span>
                  <span className="text-xs text-fg-muted">
                    granted {formatDateTime(r.granted_at)}
                    {r.revoked_at ? ` · revoked ${formatDateTime(r.revoked_at)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {!u.mfa_enrolled && activeRoles.length > 0 && (
              <p className="mt-3 text-xs text-warning">
                Two-factor authentication is off for this staff account. Ask them to turn it on.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-medium">Activity</h2>
        {u.audit.length === 0 ? (
          <p className="text-sm text-fg-muted">No audited activity.</p>
        ) : (
          <ul className="grid gap-1.5 text-sm">
            {u.audit.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap justify-between gap-x-4 border-b border-line py-1.5"
              >
                <span>
                  <span className="font-mono text-xs">{l.action}</span>
                  {l.actor_id && l.actor_id !== u.id && (
                    <span className="text-fg-subtle"> · by staff</span>
                  )}
                  {l.reason && <span className="text-fg-muted"> · {l.reason}</span>}
                </span>
                <span className="text-xs text-fg-subtle">{formatDateTime(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
