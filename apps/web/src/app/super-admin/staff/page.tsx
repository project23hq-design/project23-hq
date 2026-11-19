import Link from "next/link";
import { formatDateTime } from "@project23/domain";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Table,
  Td,
  Th,
} from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type PlatformRole } from "@/lib/admin-access";
import { PageHeader } from "@/components/dashboard-shell";
import { ActionForm } from "@/components/action-form";
import { staffRoleAction } from "../actions";

export const metadata = { title: "Staff" };

type Assignment = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: PlatformRole;
  granted_at: string;
  granted_by_email: string | null;
  revoked_at: string | null;
  mfa_enrolled: boolean;
  last_sign_in_at: string | null;
};

const ROLES: PlatformRole[] = ["super_admin", "finance_admin", "support"];

export default async function AdminStaff() {
  const { supabase, user } = await requirePlatformAdmin("staff");
  const { data, error } = await supabase.rpc("admin_staff");
  const rows = (data ?? []) as unknown as Assignment[];
  const active = rows.filter((r) => !r.revoked_at);
  const past = rows.filter((r) => r.revoked_at);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Staff"
        description="People who can open this admin area. Every change is audited."
        className="mb-0"
      />
      {error && <Alert tone="danger">Staff couldn&apos;t be loaded: {error.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <div
            key={r}
            className="rounded-xl border border-white/[0.05] bg-white/[0.035] p-4 text-sm"
          >
            <p className="font-medium">{ROLE_LABELS[r]}</p>
            <p className="mt-1 text-xs leading-5 text-fg-muted">{ROLE_DESCRIPTIONS[r]}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Grant a role</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ActionForm
            action={staffRoleAction}
            submitLabel="Grant role"
            className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] sm:items-start"
            resetOnSuccess
            confirm="Give this person access to the admin area?"
          >
            <input type="hidden" name="grant" value="true" />
            <Input
              name="email"
              type="email"
              required
              placeholder="Their account email"
              aria-label="Email"
            />
            <Select name="role" required defaultValue="support" aria-label="Role">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
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
            They need a Project23 account first. Ask every staff member to turn on two-factor
            authentication at Account → Security; it&apos;s optional but protects the admin area if
            their password leaks.
          </p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-medium">Active staff</h2>
        <Table>
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>Role</Th>
              <Th>2FA</Th>
              <Th>Granted</Th>
              <Th>Revoke</Th>
            </tr>
          </thead>
          <tbody>
            {active.map((r) => (
              <tr key={r.user_id + r.role} className="align-top">
                <Td>
                  <Link
                    href={`/super-admin/users/${r.user_id}`}
                    className="font-medium hover:text-brand"
                  >
                    {r.full_name || r.email}
                  </Link>
                  {r.user_id === user.id && <span className="text-xs text-fg-subtle"> (you)</span>}
                  {r.full_name && <p className="text-xs text-fg-subtle">{r.email}</p>}
                </Td>
                <Td>
                  <Badge tone="info">{ROLE_LABELS[r.role]}</Badge>
                </Td>
                <Td>
                  {r.mfa_enrolled ? (
                    <Badge tone="success">on</Badge>
                  ) : (
                    <Badge tone="warning">off</Badge>
                  )}
                </Td>
                <Td className="text-xs text-fg-muted">
                  {formatDateTime(r.granted_at)}
                  {r.granted_by_email && <span className="block">by {r.granted_by_email}</span>}
                </Td>
                <Td>
                  <ActionForm
                    action={staffRoleAction}
                    submitLabel="Revoke"
                    submitVariant="danger"
                    inline
                    confirm={`Revoke ${ROLE_LABELS[r.role]} from ${r.email}?`}
                  >
                    <input type="hidden" name="grant" value="false" />
                    <input type="hidden" name="email" value={r.email} />
                    <input type="hidden" name="role" value={r.role} />
                    <Input
                      name="reason"
                      required
                      minLength={3}
                      placeholder="Reason"
                      className="h-9 w-36"
                      aria-label="Reason"
                    />
                  </ActionForm>
                </Td>
              </tr>
            ))}
            {active.length === 0 && (
              <tr>
                <Td colSpan={5} className="py-8 text-center text-fg-muted">
                  No active staff.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>

      {past.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-fg-muted">Revoked roles ({past.length})</summary>
          <ul className="mt-3 grid gap-1">
            {past.map((r) => (
              <li
                key={r.user_id + r.role}
                className="flex flex-wrap justify-between gap-x-4 border-b border-line py-1.5"
              >
                <span>
                  {r.email} · {ROLE_LABELS[r.role]}
                </span>
                <span className="text-xs text-fg-subtle">
                  revoked {formatDateTime(r.revoked_at!)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
