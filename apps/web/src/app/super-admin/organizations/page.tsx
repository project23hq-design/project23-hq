import { formatDateTime } from "@project23/domain";
import { Badge, Input, Select, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { updateOrgAction } from "../actions";

export default async function AdminOrgs({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  let query = supabase
    .from("organizations")
    .select("*, memberships(count)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (q)
    query = query.or(
      `name.ilike.%${q.replace(/[^\w\s-]/g, "")}%,slug.ilike.%${q.replace(/[^\w\s-]/g, "")}%`,
    );
  const { data: orgs } = await query;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Organizations</h1>
      <form>
        <Input name="q" defaultValue={q} placeholder="Search name or slug" className="max-w-sm" />
      </form>
      <p className="text-sm text-fg-muted">
        Approval, public verification and payout eligibility are independent. Suspension stops new
        sales and publishing; existing tickets, orders and financial records are untouched.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Organization</Th>
            <Th>State</Th>
            <Th>Change (reason required, audited)</Th>
          </tr>
        </thead>
        <tbody>
          {orgs?.map((o) => (
            <tr key={o.id} className="align-top">
              <Td>
                <p className="font-medium">{o.name}</p>
                <p className="text-xs text-fg-subtle">
                  /{o.slug} · {o.contact_email} · since {formatDateTime(o.created_at)}
                </p>
              </Td>
              <Td className="space-x-1 space-y-1">
                {o.is_first_party && <Badge tone="accent">first-party</Badge>}
                <Badge tone={o.approval_status === "approved" ? "success" : "warning"}>
                  {o.approval_status}
                </Badge>
                <Badge>{o.verification_status}</Badge>
                <Badge>payout: {o.payout_status}</Badge>
                {o.status === "suspended" && <Badge tone="danger">suspended</Badge>}
              </Td>
              <Td>
                <ActionForm
                  action={updateOrgAction}
                  submitLabel="Apply"
                  submitVariant="secondary"
                  className="grid gap-2 sm:grid-cols-3"
                >
                  <input type="hidden" name="orgId" value={o.id} />
                  <Select name="approval_status" defaultValue="">
                    <option value="">Approval…</option>
                    <option value="approved">approved</option>
                    <option value="rejected">rejected</option>
                    <option value="pending">pending</option>
                  </Select>
                  <Select name="verification_status" defaultValue="">
                    <option value="">Verification…</option>
                    <option value="verified">verified</option>
                    <option value="unverified">unverified</option>
                  </Select>
                  <Select name="payout_status" defaultValue="">
                    <option value="">Payouts…</option>
                    <option value="eligible">eligible</option>
                    <option value="pending_review">pending review</option>
                    <option value="suspended">suspended</option>
                    <option value="not_ready">not ready</option>
                  </Select>
                  <Select name="status" defaultValue="">
                    <option value="">Status…</option>
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                  </Select>
                  <Input name="reason" placeholder="Reason" required className="sm:col-span-2" />
                </ActionForm>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
