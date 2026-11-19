import Link from "next/link";
import { formatDateTime } from "@project23/domain";
import { Alert, Badge, Input, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { ROLE_LABELS, type PlatformRole } from "@/lib/admin-access";
import { PageHeader, TabLinks } from "@/components/dashboard-shell";
import { Pagination, pageRange } from "@/components/admin/pagination";

export const metadata = { title: "Users" };

const FILTERS = [
  ["all", "All"],
  ["organizers", "Organizers"],
  ["promoters", "Promoters"],
  ["staff", "Staff"],
  ["unverified", "Unverified"],
  ["banned", "Banned"],
] as const;

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  banned: boolean;
  roles: PlatformRole[];
  org_count: number;
  order_count: number;
};

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const filter = FILTERS.some(([k]) => k === sp.filter) ? sp.filter! : "all";
  const { page, from, size } = pageRange(sp.page);
  const { supabase } = await requirePlatformAdmin("users");
  const { data, error } = await supabase.rpc("admin_users", {
    p_q: q || undefined,
    p_filter: filter,
    p_limit: size,
    p_offset: from,
  });
  const result = (data ?? { total: 0, rows: [] }) as unknown as { total: number; rows: UserRow[] };
  const qs = (f: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f !== "all") p.set("filter", f);
    const s = p.toString();
    return `/super-admin/users${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description="Everyone with a Project23 account: buyers, organizers, promoters and staff."
        className="mb-2"
      />
      <form className="flex flex-wrap gap-2">
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search email or name"
          aria-label="Search users"
          className="max-w-sm"
        />
      </form>
      <TabLinks
        label="Filter users"
        links={FILTERS.map(([k, label]) => ({ href: qs(k), label, active: k === filter }))}
      />
      {error && <Alert tone="danger">Users couldn&apos;t be loaded: {error.message}</Alert>}
      <div>
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Status</Th>
              <Th className="text-right">Orders</Th>
              <Th className="text-right">Orgs</Th>
              <Th>Joined</Th>
              <Th>Last sign-in</Th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((u) => (
              <tr key={u.id}>
                <Td>
                  <Link
                    href={`/super-admin/users/${u.id}`}
                    className="font-medium hover:text-brand"
                  >
                    {u.full_name || u.email}
                  </Link>
                  {u.full_name && <p className="text-xs text-fg-subtle">{u.email}</p>}
                </Td>
                <Td className="space-x-1">
                  {u.banned && <Badge tone="danger">banned</Badge>}
                  {!u.email_confirmed && <Badge tone="warning">unverified</Badge>}
                  {u.roles.map((r) => (
                    <Badge key={r} tone="info">
                      {ROLE_LABELS[r] ?? r}
                    </Badge>
                  ))}
                  {!u.banned && u.email_confirmed && u.roles.length === 0 && (
                    <Badge tone="success">active</Badge>
                  )}
                </Td>
                <Td className="text-right tabular-nums">{u.order_count}</Td>
                <Td className="text-right tabular-nums">{u.org_count}</Td>
                <Td className="text-xs text-fg-muted">{formatDateTime(u.created_at)}</Td>
                <Td className="text-xs text-fg-muted">
                  {u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : "Never"}
                </Td>
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <Td colSpan={6} className="py-10 text-center text-fg-muted">
                  No users match.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
        <Pagination
          basePath="/super-admin/users"
          params={{ q: q || undefined, filter: filter === "all" ? undefined : filter }}
          page={page}
          total={result.total}
        />
      </div>
    </div>
  );
}
