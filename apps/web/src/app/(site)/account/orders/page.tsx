import Link from "next/link";
import { formatDateTime, formatMoney } from "@project23/domain";
import { Badge, EmptyState, Table, Td, Th } from "@project23/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Orders" };

export default async function OrdersPage() {
  const { supabase } = await requireUser("/account/orders");
  await supabase.rpc("link_my_orders");
  const { data: orders } = await supabase
    .from("orders")
    .select("id, public_ref, status, total_minor, created_at, events(title)")
    .not("status", "in", "(expired,cancelled)")
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <div>
      <h1 className="mb-6 text-3xl font-medium">Orders</h1>
      {!orders?.length ? (
        <EmptyState title="No orders yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Event</Th>
              <Th>Date</Th>
              <Th>Total</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <Td>
                  <Link
                    className="font-mono text-accent hover:underline"
                    href={`/account/orders/${o.id}`}
                  >
                    {o.public_ref}
                  </Link>
                </Td>
                <Td>{(o.events as unknown as { title: string })?.title}</Td>
                <Td className="text-fg-muted">{formatDateTime(o.created_at)}</Td>
                <Td className="tabular-nums">{formatMoney(o.total_minor)}</Td>
                <Td>
                  <Badge tone={o.status === "paid" ? "success" : "warning"}>
                    {o.status.replace(/_/g, " ")}
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
