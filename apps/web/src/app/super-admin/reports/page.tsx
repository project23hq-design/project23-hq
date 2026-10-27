import { formatDateTime } from "@project23/domain";
import { Badge, Input, Select, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { promoterOversightAction, reportAction } from "../actions";

export default async function Reports() {
  const { supabase } = await requirePlatformAdmin();
  const [{ data: reports }, { data: flags }] = await Promise.all([
    supabase.from("reports").select("*, events(title, slug)").in("status", ["open", "reviewing"]).order("created_at"),
    supabase.from("referral_flags").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(50),
  ]);
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Reports & referral flags</h1>
      <Table><thead><tr><Th>Event</Th><Th>Reason</Th><Th>Details</Th><Th>Resolve</Th></tr></thead><tbody>
        {reports?.map((r) => <tr key={r.id}><Td>{(r.events as unknown as { title: string })?.title}<p className="text-xs text-fg-subtle">{formatDateTime(r.created_at)}</p></Td><Td><Badge tone="warning">{r.reason}</Badge></Td><Td className="max-w-72 text-xs">{r.details}</Td>
          <Td><ActionForm action={reportAction} submitLabel="Save" inline><input type="hidden" name="reportId" value={r.id} /><Select name="status" className="h-9 w-28"><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></Select><Input name="resolution" placeholder="Resolution" className="h-9 w-36" /></ActionForm></Td></tr>)}
        {!reports?.length && <tr><Td colSpan={4} className="text-fg-muted">No open reports.</Td></tr>}
      </tbody></Table>
      <h2 className="text-xl font-bold">Referral review flags</h2>
      <p className="text-sm text-fg-muted">Heuristic signals (blocked self-referrals, repeated buyer patterns) for human review — not automatic penalties.</p>
      <Table><thead><tr><Th>Kind</Th><Th>Enrollment</Th><Th>When</Th><Th>Action</Th></tr></thead><tbody>
        {flags?.map((f) => <tr key={f.id}><Td>{f.kind}</Td><Td className="font-mono text-xs">{f.enrollment_id?.slice(0, 8)}</Td><Td>{formatDateTime(f.created_at)}</Td>
          <Td>{f.enrollment_id && <ActionForm action={promoterOversightAction} submitLabel="Suspend promoter" submitVariant="danger" inline><input type="hidden" name="enrollmentId" value={f.enrollment_id} /><input type="hidden" name="status" value="suspended" /><Input name="reason" placeholder="Reason" required className="h-9 w-36" /></ActionForm>}</Td></tr>)}
      </tbody></Table>
    </div>
  );
}
