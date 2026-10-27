import { formatDateTime, formatMoney } from "@project23/domain";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Table,
  Td,
  Th,
} from "@project23/ui";
import { requireOrg } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { organizerRefundAction, reissueTicketAction, reviewRefundAction } from "../actions";

export default async function OrgOrders({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ q?: string; event?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { supabase, org } = await requireOrg(slug, ["owner", "manager", "finance"]);
  let q = supabase
    .from("orders")
    .select(
      "id, public_ref, buyer_name, buyer_email, status, channel, payment_method, total_minor, organizer_net_minor, promoter_commission_minor, platform_fee_minor, admissions, created_at, events(title), order_items(id, ticket_type_name, quantity, refunded_units)",
    )
    .eq("organization_id", org.id)
    .not("status", "in", "(expired,cancelled)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (sp.q)
    q = q.or(
      `public_ref.ilike.%${sp.q.replace(/[^A-Za-z0-9@.\- ]/g, "")}%,buyer_email.ilike.%${sp.q.replace(/[^A-Za-z0-9@.\- ]/g, "")}%`,
    );
  const [{ data: orders }, { data: requests }] = await Promise.all([
    q,
    supabase
      .from("refund_requests")
      .select("id, order_id, reason, amount_minor, created_at, orders(public_ref, buyer_name)")
      .eq("organization_id", org.id)
      .eq("status", "requested"),
  ]);
  const hiddenOrg = <input type="hidden" name="org" value={org.slug} />;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-[28px]">Orders</h1>
      {!!requests?.length && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle>Refund requests awaiting review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-line p-4">
                <p className="font-medium">
                  {(r.orders as unknown as { public_ref: string; buyer_name: string }).buyer_name} ·{" "}
                  <span className="font-mono">
                    {(r.orders as unknown as { public_ref: string }).public_ref}
                  </span>{" "}
                  · {formatMoney(r.amount_minor)}
                </p>
                <p className="mt-1 text-sm text-fg-muted">“{r.reason}”</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionForm action={reviewRefundAction} submitLabel="Approve refund" inline>
                    {hiddenOrg}
                    <input type="hidden" name="refundId" value={r.id} />
                    <input type="hidden" name="approve" value="true" />
                    <Input name="note" placeholder="Note (optional)" className="h-9 w-48" />
                  </ActionForm>
                  <ActionForm
                    action={reviewRefundAction}
                    submitLabel="Decline"
                    submitVariant="secondary"
                    inline
                  >
                    {hiddenOrg}
                    <input type="hidden" name="refundId" value={r.id} />
                    <input type="hidden" name="approve" value="false" />
                    <Input name="note" placeholder="Reason (required)" className="h-9 w-48" />
                  </ActionForm>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <form className="flex max-w-md gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Search order ref or buyer email" />
        <button className="sr-only">Search</button>
      </form>
      {!orders?.length ? (
        <EmptyState title="No orders yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Buyer</Th>
              <Th>Event</Th>
              <Th>Total</Th>
              <Th>Your net</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="align-top">
                <Td>
                  <span className="font-mono text-xs">{o.public_ref}</span>
                  <p className="text-xs text-fg-subtle">{formatDateTime(o.created_at)}</p>
                </Td>
                <Td>
                  {o.buyer_name}
                  <p className="text-xs text-fg-subtle">{o.buyer_email}</p>
                </Td>
                <Td className="max-w-40 truncate">
                  {(o.events as unknown as { title: string })?.title}
                  <p className="text-xs text-fg-subtle">
                    {o.admissions} adm · {o.channel}
                    {o.payment_method !== "paystack" ? ` · ${o.payment_method}` : ""}
                  </p>
                </Td>
                <Td className="tabular-nums">{formatMoney(o.total_minor)}</Td>
                <Td className="tabular-nums">
                  {o.payment_method === "paystack" ? formatMoney(o.organizer_net_minor) : "—"}
                  {o.promoter_commission_minor > 0 && (
                    <p className="text-xs text-fg-subtle">
                      incl. −{formatMoney(o.promoter_commission_minor)} promoter
                    </p>
                  )}
                </Td>
                <Td>
                  <Badge
                    tone={
                      o.status === "paid"
                        ? "success"
                        : o.status === "refunded"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {o.status.replace(/_/g, " ")}
                  </Badge>
                </Td>
                <Td>
                  {(["paid", "partially_refunded"].includes(o.status) && org.role !== "finance") ||
                  ["paid", "partially_refunded"].includes(o.status) ? (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-accent">Refund</summary>
                      <ActionForm
                        action={organizerRefundAction}
                        submitLabel="Refund now"
                        submitVariant="danger"
                        className="mt-2 grid w-64 gap-2"
                        confirm="Refund and void these tickets?"
                      >
                        {hiddenOrg}
                        <input type="hidden" name="orderId" value={o.id} />
                        <select
                          name="orderItemId"
                          className="h-9 rounded-lg border border-line bg-surface-1 px-2"
                        >
                          <option value="">All remaining tickets</option>
                          {(
                            o.order_items as unknown as {
                              id: string;
                              ticket_type_name: string;
                              quantity: number;
                              refunded_units: number;
                            }[]
                          ).map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.ticket_type_name} ({i.quantity - i.refunded_units} left)
                            </option>
                          ))}
                        </select>
                        <Input
                          name="units"
                          type="number"
                          min={1}
                          placeholder="Units (for one type)"
                          className="h-9"
                        />
                        <Input name="reason" placeholder="Reason" required className="h-9" />
                        <label className="text-xs">
                          <input type="checkbox" name="includeUsed" className="mr-1" />
                          Include checked-in tickets
                        </label>
                      </ActionForm>
                    </details>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {org.role !== "finance" && (
        <Card>
          <CardHeader>
            <CardTitle>Reissue a ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="mb-3">
              Use when a QR code was shared or lost. The old code stops working immediately; the
              buyer receives the new one.
            </Alert>
            <ActionForm action={reissueTicketAction} submitLabel="Reissue" inline>
              {hiddenOrg}
              <Input
                name="ticketId"
                placeholder="Ticket id (from attendee list)"
                className="h-9 w-72"
              />
              <Input name="reason" placeholder="Reason" className="h-9 w-48" />
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
