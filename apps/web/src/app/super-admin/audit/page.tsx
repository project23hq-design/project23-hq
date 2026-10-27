import { formatDateTime } from "@project23/domain";
import { Input, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function Audit({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const { action } = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  let q = supabase.from("audit_logs").select("*").order("id", { ascending: false }).limit(200);
  if (action) q = q.ilike("action", `${action.replace(/[^a-z._]/g, "")}%`);
  const { data } = await q;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Audit log</h1>
      <form><Input name="action" defaultValue={action} placeholder="Filter by action prefix, e.g. payout." className="max-w-sm" /></form>
      <Table><thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Reason</Th><Th>Details</Th></tr></thead><tbody>
        {data?.map((a) => <tr key={a.id}><Td className="text-xs">{formatDateTime(a.created_at)}</Td><Td className="font-mono text-xs">{a.actor_id?.slice(0, 8) ?? a.actor_kind}</Td><Td className="font-mono text-xs">{a.action}</Td>
          <Td className="font-mono text-xs">{a.entity_type}:{a.entity_id?.slice(0, 12)}</Td><Td className="text-xs">{a.reason}</Td><Td className="max-w-72 truncate font-mono text-xs">{JSON.stringify(a.metadata)}</Td></tr>)}
      </tbody></Table>
    </div>
  );
}
