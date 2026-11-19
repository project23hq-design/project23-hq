import Link from "next/link";
import { formatDateTime } from "@project23/domain";
import { Input, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { Pagination, pageRange } from "@/components/admin/pagination";

export const metadata = { title: "Audit log" };

const AUDIT_PAGE_SIZE = 50;

/** Link an audited entity to its admin page where one exists. */
function entityHref(type: string, id: string | null, orgId: string | null) {
  if (!id) return null;
  if (type === "user") return `/super-admin/users/${id}`;
  if (type === "event") return `/super-admin/events/${id}`;
  if (type === "organization") return `/super-admin/organizations/${id}`;
  if (orgId) return `/super-admin/organizations/${orgId}`;
  return null;
}

export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const action = (sp.action ?? "").replace(/[^a-z._]/g, "");
  const { page, from, to } = pageRange(sp.page, AUDIT_PAGE_SIZE);
  const { supabase } = await requirePlatformAdmin("audit");
  let q = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("id", { ascending: false })
    .range(from, to);
  if (action) q = q.ilike("action", `${action}%`);
  const { data, count } = await q;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-[28px]">Audit log</h1>
      <form>
        <Input
          name="action"
          defaultValue={action}
          placeholder="Filter by action prefix, e.g. payout. or user."
          aria-label="Filter by action"
          className="max-w-sm"
        />
      </form>
      <div>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
              <Th>Reason</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {data?.map((a) => {
              const href = entityHref(a.entity_type, a.entity_id, a.organization_id);
              const entity = `${a.entity_type}:${a.entity_id?.slice(0, 12) ?? ""}`;
              return (
                <tr key={a.id}>
                  <Td className="text-xs">{formatDateTime(a.created_at)}</Td>
                  <Td className="font-mono text-xs">
                    {a.actor_id ? (
                      <Link className="hover:text-brand" href={`/super-admin/users/${a.actor_id}`}>
                        {a.actor_id.slice(0, 8)}
                      </Link>
                    ) : (
                      a.actor_kind
                    )}
                  </Td>
                  <Td className="font-mono text-xs">{a.action}</Td>
                  <Td className="font-mono text-xs">
                    {href ? (
                      <Link className="hover:text-brand" href={href}>
                        {entity}
                      </Link>
                    ) : (
                      entity
                    )}
                  </Td>
                  <Td className="text-xs">{a.reason}</Td>
                  <Td
                    className="max-w-72 truncate font-mono text-xs"
                    title={JSON.stringify(a.metadata)}
                  >
                    {JSON.stringify(a.metadata)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination
          basePath="/super-admin/audit"
          params={{ action: action || undefined }}
          page={page}
          total={count ?? 0}
          size={AUDIT_PAGE_SIZE}
        />
      </div>
    </div>
  );
}
